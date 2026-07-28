from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.ai.contracts import ConfidenceBand, RouteType, VerificationStatus
from app.models import (
    Analysis,
    AnalysisEvent,
    AuditLog,
    CaseRecord,
    Consent,
    Fact,
    Review,
    Route,
    Tombstone,
    User,
    Video,
    VideoChunk,
)
from app.schemas import (
    CaseApprovalRead,
    CaseApprovalRequest,
    CaseRead,
    FactRead,
    FactReviewRequest,
    RouteRead,
    SourceRead,
    TimelineEventRead,
)
from app.security.crypto import EnvelopeCipher
from app.services.audit import AuditService
from app.services.rag import RagCatalog


class CaseConflictError(ValueError):
    pass


class CaseService:
    def __init__(
        self,
        *,
        cipher: EnvelopeCipher,
        audit: AuditService,
        rag: RagCatalog,
        storage_dir: Path,
        retention_days: int = 7,
    ) -> None:
        self.cipher = cipher
        self.audit = audit
        self.rag = rag
        self.storage_dir = storage_dir
        self.retention_days = retention_days

    def _event_payload(self, event: AnalysisEvent) -> dict[str, Any]:
        value = self.cipher.decrypt_json(
            f"{event.analysis_id}:{event.sequence}",
            "analysis_event",
            event.encrypted_payload(),
        )
        if not isinstance(value, dict):
            raise TypeError("analysis event payload must be an object")
        return value

    def _fact_value(self, fact: Fact) -> dict[str, Any]:
        value = self.cipher.decrypt_json(
            fact.id,
            "fact",
            fact.encrypted_payload(),
        )
        if not isinstance(value, dict):
            raise TypeError("fact payload must be an object")
        return value

    def _route_value(self, route: Route) -> dict[str, Any]:
        value = self.cipher.decrypt_json(
            route.id,
            "route",
            route.encrypted_payload(),
        )
        if not isinstance(value, dict):
            raise TypeError("route payload must be an object")
        return value

    def read(self, session: Session, case: CaseRecord) -> CaseRead:
        events = list(
            session.scalars(
                select(AnalysisEvent)
                .where(AnalysisEvent.analysis_id == case.analysis_id)
                .order_by(AnalysisEvent.sequence)
            )
        )
        by_stage = {event.stage: self._event_payload(event) for event in events}
        fact_records = list(
            session.scalars(
                select(Fact).where(Fact.case_id == case.id).order_by(Fact.created_at)
            )
        )
        route_records = list(
            session.scalars(
                select(Route).where(Route.case_id == case.id).order_by(Route.created_at)
            )
        )
        facts: list[FactRead] = []
        for fact in fact_records:
            value = self._fact_value(fact)
            value.setdefault("label", value.get("key", fact.fact_type))
            facts.append(FactRead.model_validate(value))
        routes = [
            RouteRead.model_validate(self._route_value(route))
            for route in route_records
        ]
        source_values = by_stage.get("sources", {}).get("sources", [])
        sources = [SourceRead.model_validate(value) for value in source_values]
        classification = by_stage.get("classification", {})
        if isinstance(classification.get("classification"), dict):
            classification = classification["classification"]
        else:
            classification = {
                key: value
                for key, value in classification.items()
                if key not in {"state"}
            }
        critical_inconsistencies = sum(
            fact.is_critical
            and fact.verification_status is not VerificationStatus.CONFIRMED
            for fact in facts
        )
        return CaseRead(
            id=case.id,
            analysis_id=case.analysis_id,
            video_id=case.video_id,
            status=case.status,
            recommendation_status=case.recommendation_status,
            approved_at=case.approved_at,
            video_stream_url=f"/api/v1/videos/{case.video_id}/stream",
            segments=by_stage.get("transcription", {}).get("segments", []),
            timeline=[
                TimelineEventRead.model_validate(value)
                for value in by_stage.get("timeline", {}).get("events", [])
            ],
            facts=facts,
            classification=classification,
            sources=sources,
            routes=routes,
            critical_inconsistencies=critical_inconsistencies,
        )

    def review_fact(
        self,
        session: Session,
        *,
        case: CaseRecord,
        fact: Fact,
        payload: FactReviewRequest,
        actor: User,
    ) -> FactRead:
        current = self._fact_value(fact)
        proposed_value = payload.value
        if payload.action == "confirm" and proposed_value is None:
            proposed_value = current.get("value")
        if payload.action == "confirm" and proposed_value is None:
            raise CaseConflictError("La confirmación requiere un valor identificado")

        is_validator = actor.role in {"validador", "admin"}
        next_status = (
            VerificationStatus.CONFIRMED
            if is_validator
            else VerificationStatus.PENDING
        )
        next_confidence = (
            ConfidenceBand.HIGH
            if is_validator
            else ConfidenceBand.MEDIUM
        )
        changed = {
            **current,
            "id": fact.id,
            "value": proposed_value,
            "verification_status": next_status.value,
            "confidence_band": next_confidence.value,
        }
        encrypted = self.cipher.encrypt_json(fact.id, "fact", changed)
        fact.set_encrypted_payload(encrypted)
        fact.verification_status = next_status.value
        fact.confidence_band = next_confidence.value

        review_id = str(uuid4())
        details = self.cipher.encrypt_json(
            review_id,
            "review",
            {
                "action": payload.action,
                "previous_value": current.get("value"),
                "new_value": proposed_value,
                "reason": payload.reason,
                "resulting_status": next_status.value,
            },
        )
        session.add(
            Review(
                id=review_id,
                case_id=case.id,
                fact_id=fact.id,
                actor_id=actor.id,
                action=payload.action,
                key_version=details.key_version,
                nonce=details.nonce,
                ciphertext=details.ciphertext,
            )
        )
        session.add(
            self.audit.build_record(
                actor_id=actor.id,
                actor_role=actor.role,
                action="fact_reviewed",
                entity_type="fact",
                entity_id=fact.id,
                details={
                    "review_id": review_id,
                    "resulting_status": next_status.value,
                },
            )
        )
        return FactRead.model_validate(changed)

    def approve(
        self,
        session: Session,
        *,
        case: CaseRecord,
        payload: CaseApprovalRequest,
        actor: User,
        now: datetime | None = None,
    ) -> CaseApprovalRead:
        facts = list(session.scalars(select(Fact).where(Fact.case_id == case.id)))
        if any(
            fact.is_critical
            and fact.verification_status != VerificationStatus.CONFIRMED.value
            for fact in facts
        ):
            raise CaseConflictError(
                "Existen inconsistencias críticas pendientes de validación"
            )
        routes = list(session.scalars(select(Route).where(Route.case_id == case.id)))
        existing_types = {RouteType(route.route_type) for route in routes}
        confirmed_types = set(payload.confirmed_route_types)
        required_types = set(RouteType)
        if existing_types != required_types or confirmed_types != required_types:
            raise CaseConflictError(
                "Deben confirmarse las tres rutas antes de aprobar"
            )

        for route in routes:
            value = self._route_value(route)
            value["verification_status"] = VerificationStatus.CONFIRMED.value
            value["confidence_band"] = ConfidenceBand.HIGH.value
            encrypted = self.cipher.encrypt_json(route.id, "route", value)
            route.set_encrypted_payload(encrypted)
            route.verification_status = VerificationStatus.CONFIRMED.value
            route.confidence_band = ConfidenceBand.HIGH.value

        approved_at = now or datetime.now(timezone.utc)
        delete_after = approved_at + timedelta(days=self.retention_days)
        video = session.get(Video, case.video_id)
        if video is None:
            raise CaseConflictError("El video asociado no existe")
        case.status = "approved"
        case.recommendation_status = "final"
        case.approved_by_id = actor.id
        case.approved_at = approved_at
        video.delete_after = delete_after
        session.add(
            self.audit.build_record(
                actor_id=actor.id,
                actor_role=actor.role,
                action="case_approved",
                entity_type="case",
                entity_id=case.id,
                details={
                    "route_types": sorted(value.value for value in confirmed_types),
                    "video_delete_after": delete_after.isoformat(),
                },
            )
        )
        return CaseApprovalRead(
            id=case.id,
            status=case.status,
            recommendation_status=case.recommendation_status,
            approved_at=approved_at,
            video_delete_after=delete_after,
            video_retention_days=self.retention_days,
        )

    def total_delete(
        self,
        session: Session,
        *,
        case: CaseRecord,
        actor: User,
        now: datetime | None = None,
    ) -> Tombstone:
        deleted_at = now or datetime.now(timezone.utc)
        analysis = session.get(Analysis, case.analysis_id)
        video = session.get(Video, case.video_id)
        consent_id = video.consent_id if video is not None else None
        chunk_paths = [
            self.storage_dir / path
            for path in session.scalars(
                select(VideoChunk.storage_path).where(
                    VideoChunk.video_id == case.video_id
                )
            )
        ]

        session.execute(delete(Review).where(Review.case_id == case.id))
        session.execute(delete(Fact).where(Fact.case_id == case.id))
        session.execute(delete(Route).where(Route.case_id == case.id))
        session.execute(
            delete(AuditLog).where(
                AuditLog.entity_id.in_([case.id, case.video_id, case.analysis_id])
            )
        )
        session.delete(case)
        session.flush()
        if analysis is not None:
            session.delete(analysis)
            session.flush()
        if video is not None:
            session.delete(video)
            session.flush()
        if consent_id is not None:
            consent = session.get(Consent, consent_id)
            if consent is not None:
                session.delete(consent)

        for chunk_path in chunk_paths:
            chunk_path.unlink(missing_ok=True)
        for directory in {path.parent for path in chunk_paths}:
            try:
                directory.rmdir()
            except OSError:
                pass

        tombstone = Tombstone(
            id=str(uuid4()),
            case_id_hash=self.cipher.fingerprint(case.id, purpose="tombstone"),
            deleted_at=deleted_at,
            action="case_total_deleted",
            actor_role=actor.role,
        )
        session.add(tombstone)
        return tombstone

    def tombstone_for(self, session: Session, case_id: str) -> Tombstone | None:
        case_hash = self.cipher.fingerprint(case_id, purpose="tombstone")
        return session.scalar(
            select(Tombstone).where(Tombstone.case_id_hash == case_hash)
        )

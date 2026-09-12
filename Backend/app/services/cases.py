from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.ai.contracts import ConfidenceBand, RouteType, VerificationStatus
from app.ai.vulnerabilities import (
    VULNERABILITIES_KEY,
    VULNERABILITIES_LABEL,
    display_vulnerabilities,
    normalize_vulnerabilities,
)
from app.entities import (
    Analysis,
    AnalysisEvent,
    AuditLog,
    CaseRecord,
    Fact,
    MemoryImage,
    RenderedVideo,
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
    MemoryImageRead,
    RouteRead,
    SourceRead,
    TimelineEventRead,
)
from app.security.crypto import EnvelopeCipher
from app.services.analysis import RETIRED_KEYS
from app.services.assets import EncryptedAssetStore, StoredAsset
from app.services.audit import AuditService
from app.services.rag import RagCatalog
from app.services.purges import PurgeService


def _display_value(value: object) -> str | None:
    """Render a reviewed value the way the case screen will read it."""
    if value is None:
        return None
    if isinstance(value, bool):
        return "Sí" if value else "No"
    if isinstance(value, (list, tuple)):
        parts = [str(item) for item in value if item is not None]
        if not parts:
            return None
        if len(parts) == 1:
            return parts[0]
        return f"{', '.join(parts[:-1])} y {parts[-1]}"
    return str(value)


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
        purges: PurgeService | None = None,
    ) -> None:
        self.cipher = cipher
        self.audit = audit
        self.rag = rag
        self.storage_dir = storage_dir
        self.retention_days = retention_days
        self.assets = EncryptedAssetStore(cipher=cipher, storage_dir=storage_dir)
        self.purges = purges

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

    def route_steps(self, route: Route) -> list[dict[str, Any]]:
        """The persisted stops of a route, in the order the screen shows them."""
        steps = self._route_value(route).get("steps", [])
        return [step for step in steps if isinstance(step, dict)]

    def _route_value(self, route: Route) -> dict[str, Any]:
        value = self.cipher.decrypt_json(
            route.id,
            "route",
            route.encrypted_payload(),
        )
        if not isinstance(value, dict):
            raise TypeError("route payload must be an object")
        # Los casos analizados antes de que existiera key_point no lo traen.
        for step in value.get("steps") or []:
            if isinstance(step, dict):
                step.setdefault("key_point", "")
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
                select(Fact)
                .where(
                    Fact.case_id == case.id,
                    Fact.fact_type.not_in(RETIRED_KEYS),
                )
                .order_by(Fact.created_at)
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
            value.setdefault("key", fact.fact_type)
            value.setdefault("label", value["key"])
            if value["key"] == VULNERABILITIES_KEY:
                # Los casos analizados antes de las casillas traen el rótulo
                # que redactó el modelo, distinto en cada uno.
                value["label"] = VULNERABILITIES_LABEL
                value["display_value"] = (
                    display_vulnerabilities(value.get("value"))
                    or value.get("display_value")
                )
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
        memory_image = session.scalar(
            select(MemoryImage)
            .where(MemoryImage.case_id == case.id)
            .order_by(MemoryImage.generation.desc())
            .limit(1)
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
            memory_image=(
                self.memory_image_read(session, case, memory_image)
                if memory_image is not None
                else None
            ),
        )

    @staticmethod
    def memory_image_read(
        session: Session, case: CaseRecord, image: MemoryImage
    ) -> MemoryImageRead:
        image_url = (
            f"/api/v1/cases/{case.id}/memory-image/content"
            if image.status in {"pending_review", "approved"}
            else None
        )
        rendered = session.scalar(
            select(RenderedVideo).where(RenderedVideo.memory_image_id == image.id)
        )
        return MemoryImageRead(
            id=image.id,
            generation=image.generation,
            status=image.status,
            image_url=image_url,
            rendered_video_url=(
                f"/api/v1/cases/{case.id}/rendered-video/stream"
                if rendered is not None
                and rendered.status == "ready"
                and rendered.video_id is not None
                and session.get(Video, rendered.video_id) is not None
                and session.get(Video, rendered.video_id).deleted_at is None
                else None
            ),
            render_status=rendered.status if rendered is not None else None,
            failure_code=image.failure_code,
            reviewed_at=image.reviewed_at,
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
        closed = current.get("key", fact.fact_type) == VULNERABILITIES_KEY
        if closed:
            # Casillas cerradas: sólo valen las opciones de la lista.
            proposed_value = normalize_vulnerabilities(proposed_value)
            if proposed_value is None:
                raise CaseConflictError(
                    "Marca al menos una de las opciones de la lista"
                )

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
            # Un valor corregido deja obsoleto el texto que escribió el modelo:
            # sin esto, cambiar "widowed" seguía mostrando "Viuda".
            "display_value": (
                display_vulnerabilities(proposed_value)
                if closed
                else (
                    current.get("display_value")
                    if proposed_value == current.get("value")
                    else _display_value(proposed_value)
                )
            ),
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
        # Un caso analizado antes de retirar una señal la trae guardada como
        # crítica: oculta en pantalla, no puede seguir bloqueando la aprobación.
        facts = list(
            session.scalars(
                select(Fact).where(
                    Fact.case_id == case.id,
                    Fact.fact_type.not_in(RETIRED_KEYS),
                )
            )
        )
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

        video = session.get(Video, case.video_id)
        if video is None:
            raise CaseConflictError("El video asociado no existe")
        approved_at = now or datetime.now(timezone.utc)
        delete_after = approved_at + timedelta(days=self.retention_days)
        case.status = "approved"
        case.recommendation_status = "final"
        case.approved_by_id = actor.id
        case.approved_at = approved_at
        video.delete_after = delete_after
        for derived in session.scalars(
            select(Video).where(
                Video.id.in_(
                    select(RenderedVideo.video_id).where(
                        RenderedVideo.case_id == case.id,
                        RenderedVideo.video_id.is_not(None),
                    )
                )
            )
        ):
            derived.delete_after = delete_after
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
        if self.purges is None:
            raise RuntimeError("purge service is not configured")
        deleted_at = now or datetime.now(timezone.utc)
        case_id = case.id
        claimed = session.execute(
            update(CaseRecord)
            .where(
                CaseRecord.id == case_id,
                CaseRecord.deletion_claimed_at.is_(None),
            )
            .values(status="deleting", deletion_claimed_at=deleted_at)
            .execution_options(synchronize_session=False)
        )
        if claimed.rowcount == 1:
            # This commit is the durable barrier that all image/render claimers observe.
            session.commit()
            session.expire_all()
        case = session.scalar(
            select(CaseRecord)
            .where(CaseRecord.id == case_id)
            .with_for_update()
        )
        if case is None:
            raise CaseConflictError("El caso ya fue eliminado")
        if case.deletion_claimed_at is None:
            raise CaseConflictError("No fue posible reclamar la eliminación")
        analysis = session.get(Analysis, case.analysis_id)
        original_video_id = case.video_id
        fact_ids = set(
            session.scalars(select(Fact.id).where(Fact.case_id == case.id))
        )
        route_ids = set(
            session.scalars(select(Route.id).where(Route.case_id == case.id))
        )
        review_ids = set(
            session.scalars(select(Review.id).where(Review.case_id == case.id))
        )
        images = list(
            session.scalars(
                select(MemoryImage)
                .where(MemoryImage.case_id == case.id)
                .with_for_update()
            )
        )
        rendered = list(
            session.scalars(
                select(RenderedVideo)
                .where(RenderedVideo.case_id == case.id)
                .with_for_update()
            )
        )
        derived_video_ids = {
            item.video_id for item in rendered if item.video_id is not None
        }
        video_ids = {original_video_id, *derived_video_ids}
        image_assets = [
            StoredAsset(
                key_version=image.asset_key_version,
                nonce=image.asset_nonce,
                storage_path=image.storage_path,
                plaintext_size=image.plaintext_size,
                ciphertext_size=image.ciphertext_size,
            )
            for image in images
            if image.asset_key_version is not None
            and image.asset_nonce is not None
            and image.storage_path is not None
            and image.plaintext_size is not None
            and image.ciphertext_size is not None
        ]
        sensitive_entity_ids = {
            case.id,
            *video_ids,
            case.analysis_id,
            *fact_ids,
            *route_ids,
            *review_ids,
            *(image.id for image in images),
            *(item.id for item in rendered),
        }
        chunks_by_video = {
            video_id: list(
                session.scalars(
                    select(VideoChunk.storage_path).where(VideoChunk.video_id == video_id)
                )
            )
            for video_id in video_ids
        }
        for image, asset in zip(
            [
                image
                for image in images
                if image.asset_key_version is not None
                and image.asset_nonce is not None
                and image.storage_path is not None
                and image.plaintext_size is not None
                and image.ciphertext_size is not None
            ],
            image_assets,
        ):
            self.purges.enqueue_asset(session, asset_id=image.id, asset=asset)
        for video_id, paths in chunks_by_video.items():
            self.purges.enqueue_video(session, video_id=video_id, storage_paths=paths)

        session.execute(delete(RenderedVideo).where(RenderedVideo.case_id == case.id))
        session.execute(delete(MemoryImage).where(MemoryImage.case_id == case.id))
        session.execute(delete(Review).where(Review.case_id == case.id))
        session.execute(delete(Fact).where(Fact.case_id == case.id))
        session.execute(delete(Route).where(Route.case_id == case.id))
        session.execute(
            delete(AuditLog).where(
                AuditLog.entity_id.in_(sensitive_entity_ids)
            )
        )
        session.delete(case)
        session.flush()
        if analysis is not None:
            session.delete(analysis)
            session.flush()
        for video_id in video_ids:
            video = session.get(Video, video_id)
            if video is not None:
                session.delete(video)
        session.flush()
        tombstone = Tombstone(
            id=str(uuid4()),
            case_id_hash=self.cipher.fingerprint(case.id, purpose="tombstone"),
            deleted_at=deleted_at,
            action="case_total_deleted",
            actor_role=actor.role,
        )
        session.add(tombstone)
        return tombstone

    def process_pending_purges(self) -> int:
        if self.purges is None:
            return 0
        return self.purges.process_pending()

    def tombstone_for(self, session: Session, case_id: str) -> Tombstone | None:
        case_hash = self.cipher.fingerprint(case_id, purpose="tombstone")
        return session.scalar(
            select(Tombstone).where(Tombstone.case_id_hash == case_hash)
        )

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timezone
import json
import time
from typing import Any
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ai.beto import BetoAdapter
from app.ai.contracts import (
    AnalysisStage,
    ProviderAnalysis,
    ProviderRoute,
    ProviderSignal,
    RouteType,
    TranscriptResult,
)
from app.ai.providers import retry_call
from app.ai.admissibility import evaluate_admissibility, resolve_screening
from app.ai.reconcile import reconcile_readings
from app.database import Database
from app.logging import get_logger
from app.entities import (
    Analysis,
    AnalysisEvent,
    CaseRecord,
    Fact,
    Route,
    User,
    Video,
)
from app.security.crypto import EnvelopeCipher
from app.services.media import (
    MediaPipeline,
    MediaToolUnavailableError,
    MediaValidationError,
)
from app.services.rag import RagCatalog
from app.services.transcription import TranscriptionService
from app.services.videos import VideoService


ANALYSIS_STAGES = tuple(stage.value for stage in AnalysisStage)
TERMINAL_ANALYSIS_STATES = {"completed", "partial", "failed"}
logger = get_logger("senda.analysis")
# Vocabulario canónico de señales. El prompt (app/ai/providers.py, "CLAVES
# OBLIGATORIAS") le exige al modelo estas grafías exactas, y aquí se consumen por
# nombre para tres cosas: separar la etapa de personas y lugares, marcar lo
# crítico, y emparejar las lecturas de los dos proveedores en reconcile_readings.
# Cuando el prompt no las nombraba, el modelo inventaba claves libres y las tres
# cosas fallaban en silencio: people_places salía vacía, is_critical nunca era
# verdadero y el cruce entre proveedores no encontraba pareja. Si tocas una de
# las dos listas, toca también el prompt: tests/unit/test_claves_canonicas.py
# comprueba que sigan de acuerdo.
PEOPLE_PLACE_KEYS = {"people", "current_location", "origin_location", "places"}

# Lo que condiciona una orientación segura: si esto está mal, la ruta que se
# entrega puede ser peligrosa. Es lo que exige revisión humana antes de aprobar.
CRITICAL_KEYS = {"urgency", "vulnerabilities"}


class NoAudioError(ValueError):
    pass


class AnalysisAlreadyExistsError(ValueError):
    pass


class AnalysisService:
    def __init__(
        self,
        *,
        database: Database,
        cipher: EnvelopeCipher,
        rag: RagCatalog,
        beto: BetoAdapter,
        video_service: VideoService | None = None,
        media: MediaPipeline | None = None,
        transcription: TranscriptionService | None = None,
        gpt: Any | None = None,
        claude: Any | None = None,
        memory_images: Any | None = None,
        retry_attempts: int = 2,
    ) -> None:
        self.database = database
        self.cipher = cipher
        self.rag = rag
        self.beto = beto
        self.video_service = video_service
        # El audio se extrae por bloques y se transcribe con el servicio que
        # los une: el adaptador de Whisper sólo sabe de un bloque a la vez.
        self.media = media
        self.transcription = transcription
        self.gpt = gpt
        self.claude = claude
        self.memory_images = memory_images
        self.retry_attempts = retry_attempts

    def start(self, session: Session, *, video: Video, user: User) -> Analysis:
        existing = session.scalar(
            select(Analysis).where(Analysis.video_id == video.id)
        )
        if existing is not None:
            raise AnalysisAlreadyExistsError(
                "video already has a durable analysis"
            )
        analysis = Analysis(
            id=str(uuid4()),
            video_id=video.id,
            requested_by_id=user.id,
            status="queued",
        )
        try:
            with session.begin_nested():
                session.add(analysis)
                session.flush()
        except IntegrityError as exception:
            raise AnalysisAlreadyExistsError(
                "video already has a durable analysis"
            ) from exception
        return analysis

    def _append_event(
        self,
        analysis_id: str,
        stage: AnalysisStage,
        payload: dict[str, Any],
        *,
        state: str = "completed",
    ) -> int:
        with self.database.session() as session:
            analysis = session.get(Analysis, analysis_id)
            if analysis is None:
                raise KeyError(analysis_id)
            next_sequence = session.scalar(
                update(Analysis)
                .where(Analysis.id == analysis_id)
                .values(
                    next_event_sequence=Analysis.next_event_sequence + 1,
                )
                .returning(Analysis.next_event_sequence)
            )
            if next_sequence is None:
                raise KeyError(analysis_id)
            sequence = int(next_sequence) - 1
            record_id = f"{analysis_id}:{sequence}"
            encrypted = self.cipher.encrypt_json(
                record_id,
                "analysis_event",
                payload,
            )
            session.add(
                AnalysisEvent(
                    analysis_id=analysis_id,
                    sequence=sequence,
                    stage=stage.value,
                    state=state,
                    key_version=encrypted.key_version,
                    nonce=encrypted.nonce,
                    ciphertext=encrypted.ciphertext,
                )
            )
            analysis.current_stage = stage.value
            analysis.status = "running"
            return sequence

    def _read_payload(self, event: AnalysisEvent) -> dict[str, Any]:
        value = self.cipher.decrypt_json(
            f"{event.analysis_id}:{event.sequence}",
            "analysis_event",
            event.encrypted_payload(),
        )
        if not isinstance(value, dict):
            raise TypeError("analysis event payload must be an object")
        return value

    def _demo_payloads(self) -> dict[AnalysisStage, dict[str, Any]]:
        segments = [
            {
                "id": "segment-1",
                "start_ms": 0,
                "end_ms": 14200,
                "text": (
                    "Caso ficticio. Una familia de cuatro personas salió de "
                    "El Tambo y llegó a Popayán."
                ),
            },
            {
                "id": "segment-2",
                "start_ms": 14200,
                "end_ms": 31800,
                "text": (
                    "Mencionan dos niñas y la necesidad de encontrar un lugar "
                    "seguro para pasar los próximos días."
                ),
            },
            {
                "id": "segment-3",
                "start_ms": 31800,
                "end_ms": 52400,
                "text": (
                    "La familia aún no decide si buscará estabilizarse o si "
                    "evaluará un retorno acompañado."
                ),
            },
        ]
        facts = [
            {
                "id": "demo-family",
                "label": "Personas",
                "value": "Familia ficticia de cuatro personas",
                "origin": "mentioned",
                "verification_status": "confirmed",
                "confidence_band": "high",
                "is_critical": False,
                "evidence": [
                    {"segment_id": "segment-1", "start_ms": 0, "end_ms": 14200}
                ],
            },
            {
                "id": "demo-location",
                "label": "Ubicación actual",
                "value": "Popayán, Cauca",
                "origin": "contrasted",
                "verification_status": "confirmed",
                "confidence_band": "high",
                "is_critical": False,
                "evidence": [
                    {"segment_id": "segment-1", "start_ms": 0, "end_ms": 14200}
                ],
            },
            {
                "id": "demo-date",
                "label": "Fecha de salida",
                "value": None,
                "origin": "mentioned",
                "verification_status": "not_identified",
                "confidence_band": "low",
                "is_critical": False,
                "evidence": [],
            },
            {
                "id": "demo-urgency",
                "label": "Urgencia",
                "value": None,
                "origin": "contrasted",
                "verification_status": "inconsistent",
                "confidence_band": "low",
                "is_critical": True,
                "provider_values": {"gpt": "high", "claude": "medium"},
                "evidence": [
                    {
                        "segment_id": "segment-2",
                        "start_ms": 14200,
                        "end_ms": 31800,
                    }
                ],
            },
            {
                "id": "demo-children",
                "label": "Niñas, niños o adolescentes",
                "value": "Dos niñas",
                "origin": "mentioned",
                "verification_status": "pending",
                "confidence_band": "medium",
                "is_critical": True,
                "evidence": [
                    {
                        "segment_id": "segment-2",
                        "start_ms": 14200,
                        "end_ms": 31800,
                    }
                ],
            },
        ]
        sources = [
            self.rag.get("uariv-crav-popayan").model_dump(mode="json"),
            self.rag.get("uariv-services-national").model_dump(mode="json"),
            self.rag.get("uariv-return-relocation").model_dump(mode="json"),
            self.rag.get("defensoria-public-ministry").model_dump(mode="json"),
            self.rag.get("icbf-mobile-units").model_dump(mode="json"),
        ]
        routes = [
            {
                "id": "demo-route-emergency",
                "route_type": "emergency",
                "title": "Atención inmediata",
                "summary": "Orientación inicial y valoración institucional en Popayán.",
                "verification_status": "pending",
                "confidence_band": "medium",
                "steps": [
                    {
                        "title": "Contactar el punto territorial",
                        "key_point": "Lleve su documento si lo conserva.",
                        "instructions": (
                            "Confirmar horario y canal vigente antes del traslado."
                        ),
                        "claims": [
                            {
                                "text": "El CRAV de Popayán orienta el acceso a la oferta institucional.",
                                "source_entry_id": "uariv-crav-popayan",
                            }
                        ],
                    },
                    {
                        "title": "Solicitar valoración de protección",
                        "key_point": "Pida que la acompañe el Ministerio Público.",
                        "instructions": (
                            "Exponer únicamente la información necesaria y pedir "
                            "acompañamiento del Ministerio Público."
                        ),
                        "claims": [
                            {
                                "text": "La Defensoría puede orientar sobre garantías y acompañamiento.",
                                "source_entry_id": "defensoria-public-ministry",
                            }
                        ],
                    },
                ],
            },
            {
                "id": "demo-route-housing",
                "route_type": "housing_stabilization",
                "title": "Estabilización de vivienda",
                "summary": "Verificar oferta vigente para una estadía segura y temporal.",
                "verification_status": "pending",
                "confidence_band": "medium",
                "steps": [
                    {
                        "title": "Revisar trámites y servicios vigentes",
                        "key_point": "Confirme requisitos antes de desplazarse.",
                        "instructions": (
                            "Contrastar requisitos y disponibilidad con la ficha oficial."
                        ),
                        "claims": [
                            {
                                "text": "La guía oficial concentra requisitos de trámites y servicios.",
                                "source_entry_id": "uariv-services-national",
                            }
                        ],
                    },
                    {
                        "title": "Coordinar atención familiar",
                        "key_point": "Diga cuántos menores viajan con usted.",
                        "instructions": (
                            "Consultar si la regional Cauca puede activar atención móvil."
                        ),
                        "claims": [
                            {
                                "text": "ICBF dispone de un procedimiento de unidades móviles para familias desplazadas.",
                                "source_entry_id": "icbf-mobile-units",
                            }
                        ],
                    },
                ],
            },
            {
                "id": "demo-route-return",
                "route_type": "return_relocation",
                "title": "Retorno o reubicación",
                "summary": "Evaluar voluntariedad, seguridad y acompañamiento antes de decidir.",
                "verification_status": "pending",
                "confidence_band": "medium",
                "steps": [
                    {
                        "title": "Solicitar evaluación acompañada",
                        "key_point": "No regrese sin evaluación de seguridad.",
                        "instructions": (
                            "No presentar el retorno como decisión tomada; pedir valoración institucional."
                        ),
                        "claims": [
                            {
                                "text": "La Unidad para las Víctimas publica una ruta de retornos y reubicaciones.",
                                "source_entry_id": "uariv-return-relocation",
                            }
                        ],
                    },
                    {
                        "title": "Contrastar garantías",
                        "key_point": "Exija por escrito las garantías ofrecidas.",
                        "instructions": (
                            "Confirmar las garantías con el Ministerio Público territorial."
                        ),
                        "claims": [
                            {
                                "text": "Las garantías aplicables deben verificarse con la autoridad competente.",
                                "source_entry_id": "defensoria-public-ministry",
                            }
                        ],
                    },
                ],
            },
        ]
        timeline = [
            {
                "id": "timeline-departure",
                "title": "Salida de El Tambo",
                "description": "La familia ficticia relata el desplazamiento hacia Popayán.",
                "start_ms": 0,
                "end_ms": 14200,
                "verification_status": "confirmed",
                "confidence_band": "high",
                "origin": "mentioned",
            },
            {
                "id": "timeline-arrival",
                "title": "Llegada a Popayán",
                "description": "Se identifica la ubicación actual de la familia.",
                "start_ms": 8600,
                "end_ms": 14200,
                "verification_status": "confirmed",
                "confidence_band": "high",
                "origin": "contrasted",
            },
            {
                "id": "timeline-needs",
                "title": "Necesidad de alojamiento seguro",
                "description": "La urgencia requiere validación humana por desacuerdo.",
                "start_ms": 14200,
                "end_ms": 31800,
                "verification_status": "inconsistent",
                "confidence_band": "low",
                "origin": "contrasted",
            },
        ]
        return {
            AnalysisStage.AUDIO: {
                "state": "completed",
                "duration_ms": 52400,
                "audio_present": True,
            },
            AnalysisStage.TRANSCRIPTION: {
                "state": "completed",
                "model": "whisper-1",
                "segments": segments,
                "fictitious": True,
            },
            AnalysisStage.PEOPLE_PLACES: {
                "state": "completed",
                "facts": facts[:2],
            },
            AnalysisStage.DATES_FACTS: {
                "state": "completed",
                "facts": facts[2:],
            },
            AnalysisStage.CLASSIFICATION: {
                "state": "completed",
                "model": "BETO",
                "scope": "category_subcategory_only",
                "category": {
                    "label": "Desplazamiento",
                    "confidence": 0.91,
                },
                "subcategory": {
                    "label": "Desplazamiento forzado",
                    "confidence": 0.87,
                },
            },
            AnalysisStage.SOURCES: {
                "state": "completed",
                "sources": sources,
            },
            AnalysisStage.TIMELINE: {
                "state": "completed",
                "events": timeline,
            },
            AnalysisStage.ROUTES: {
                "state": "completed",
                "routes": routes,
                "recommendation_status": "preliminary",
                "critical_inconsistencies": 2,
            },
        }

    def _persist_demo_case(
        self,
        session: Session,
        *,
        analysis: Analysis,
        payloads: dict[AnalysisStage, dict[str, Any]],
    ) -> str:
        case_id = str(uuid4())
        session.add(
            CaseRecord(
                id=case_id,
                analysis_id=analysis.id,
                video_id=analysis.video_id,
                status="in_review",
                recommendation_status="preliminary",
            )
        )
        facts = (
            payloads[AnalysisStage.PEOPLE_PLACES]["facts"]
            + payloads[AnalysisStage.DATES_FACTS]["facts"]
        )
        for value in facts:
            fact_id = str(uuid4())
            stored_value = {**value, "id": fact_id}
            encrypted = self.cipher.encrypt_json(fact_id, "fact", stored_value)
            session.add(
                Fact(
                    id=fact_id,
                    case_id=case_id,
                    fact_type=str(value["label"]),
                    origin=str(value["origin"]),
                    verification_status=str(value["verification_status"]),
                    confidence_band=str(value["confidence_band"]),
                    is_critical=bool(value["is_critical"]),
                    key_version=encrypted.key_version,
                    nonce=encrypted.nonce,
                    ciphertext=encrypted.ciphertext,
                )
            )
        for value in payloads[AnalysisStage.ROUTES]["routes"]:
            source_ids = [
                claim["source_entry_id"]
                for step in value["steps"]
                for claim in step["claims"]
            ]
            self.rag.validate_source_ids(source_ids)
            route_id = str(uuid4())
            stored_value = {**value, "id": route_id}
            encrypted = self.cipher.encrypt_json(route_id, "route", stored_value)
            session.add(
                Route(
                    id=route_id,
                    case_id=case_id,
                    route_type=str(value["route_type"]),
                    verification_status=str(value["verification_status"]),
                    confidence_band=str(value["confidence_band"]),
                    key_version=encrypted.key_version,
                    nonce=encrypted.nonce,
                    ciphertext=encrypted.ciphertext,
                )
            )
        session.flush()
        return case_id

    def run(self, analysis_id: str) -> None:
        started = time.monotonic()
        try:
            with self.database.session() as session:
                analysis = session.get(Analysis, analysis_id)
                if analysis is None:
                    raise KeyError(analysis_id)
                video = session.get(Video, analysis.video_id)
                if video is None:
                    raise KeyError(analysis.video_id)
                analysis.status = "running"
                analysis.started_at = datetime.now(timezone.utc)
                is_demo = video.is_demo
            if not is_demo:
                self._run_uploaded(analysis_id)
                return

            payloads = self._demo_payloads()
            for stage in AnalysisStage:
                payload = payloads[stage]
                if stage is AnalysisStage.ROUTES:
                    with self.database.session() as session:
                        analysis = session.get(Analysis, analysis_id)
                        case_id = self._persist_demo_case(
                            session,
                            analysis=analysis,
                            payloads=payloads,
                        )
                    payload = {**payload, "case_id": case_id}
                self._append_event(analysis_id, stage, payload)
                if stage is AnalysisStage.ROUTES and self.memory_images is not None:
                    try:
                        self.memory_images.generate_initial(case_id, is_demo=is_demo)
                    except Exception:
                        logger.exception(
                            "memory_image_generation_failed",
                            extra={"case_id": case_id},
                        )
            with self.database.session() as session:
                analysis = session.get(Analysis, analysis_id)
                analysis.status = "completed"
                analysis.completed_at = datetime.now(timezone.utc)
            logger.info(
                "analysis_completed",
                analysis_id=analysis_id,
                status="completed",
                duration_ms=round((time.monotonic() - started) * 1000),
            )
        except Exception as exc:
            with self.database.session() as session:
                analysis = session.get(Analysis, analysis_id)
                if analysis is not None:
                    analysis.status = "failed"
                    analysis.failure_code = type(exc).__name__
                    analysis.completed_at = datetime.now(timezone.utc)
            logger.error(
                "analysis_failed",
                analysis_id=analysis_id,
                status="failed",
                error_code=type(exc).__name__,
                duration_ms=round((time.monotonic() - started) * 1000),
            )
            raise

    def _finish_unavailable(
        self,
        analysis_id: str,
        *,
        from_stage: AnalysisStage,
        reason: str,
    ) -> None:
        start_index = list(AnalysisStage).index(from_stage)
        for stage in list(AnalysisStage)[start_index:]:
            self._append_event(
                analysis_id,
                stage,
                {"state": "unavailable", "reason": reason},
                state="unavailable",
            )
        with self.database.session() as session:
            analysis = session.get(Analysis, analysis_id)
            analysis.status = "partial"
            analysis.failure_code = reason
            analysis.completed_at = datetime.now(timezone.utc)

    def _read_provider(
        self,
        adapter: Any | None,
        segments: list[Any],
        sources: list[Any] | None = None,
        classification: dict[str, Any] | None = None,
    ) -> tuple[ProviderAnalysis | None, str | None]:
        if adapter is None:
            return None, "provider_not_configured"
        try:
            return (
                retry_call(
                    lambda: adapter.analyze(segments, sources, classification),
                    attempts=self.retry_attempts,
                    retryable=(TimeoutError, ConnectionError),
                ),
                None,
            )
        except Exception as exc:  # noqa: BLE001
            # Los SDK de los proveedores levantan sus propias excepciones
            # (autenticación, cuota, 5xx). Ninguna debe tumbar el análisis:
            # el caso continúa como parcial y queda registrado el motivo.
            logger.warning(
                "provider_read_failed",
                extra={"error_code": type(exc).__name__},
            )
            return None, type(exc).__name__

    @staticmethod
    def _signals_by_key(
        analysis: ProviderAnalysis | None,
    ) -> dict[str, ProviderSignal]:
        if analysis is None:
            return {}
        return {signal.key: signal for signal in analysis.signals}

    @staticmethod
    def _route_source_ids(route: ProviderRoute) -> list[str]:
        return [
            claim.source_entry_id
            for step in route.steps
            for claim in step.claims
        ]

    def _valid_routes(
        self,
        analysis: ProviderAnalysis | None,
    ) -> tuple[dict[RouteType, ProviderRoute], list[str]]:
        valid: dict[RouteType, ProviderRoute] = {}
        errors: list[str] = []
        if analysis is None:
            return valid, errors
        for route in analysis.routes:
            try:
                self.rag.validate_source_ids(self._route_source_ids(route))
            except ValueError as exc:
                errors.append(str(exc))
                continue
            valid[route.route_type] = route
        return valid, errors

    @staticmethod
    def _route_title(route_type: RouteType) -> str:
        return {
            RouteType.EMERGENCY: "Atención inmediata",
            RouteType.HOUSING_STABILIZATION: "Estabilización de vivienda",
            RouteType.RETURN_RELOCATION: "Retorno o reubicación",
        }[route_type]

    def _reconcile_routes(
        self,
        gpt: ProviderAnalysis | None,
        claude: ProviderAnalysis | None,
    ) -> tuple[list[dict[str, Any]], list[str], list[str]]:
        gpt_routes, gpt_errors = self._valid_routes(gpt)
        claude_routes, claude_errors = self._valid_routes(claude)
        routes: list[dict[str, Any]] = []
        source_ids: set[str] = set()
        for route_type in RouteType:
            first = gpt_routes.get(route_type)
            second = claude_routes.get(route_type)
            base: dict[str, Any] = {
                "id": str(uuid4()),
                "route_type": route_type.value,
                "title": self._route_title(route_type),
            }
            if first is not None:
                source_ids.update(self._route_source_ids(first))
            if second is not None:
                source_ids.update(self._route_source_ids(second))
            if first is not None and second is not None:
                first_value = first.model_dump(mode="json")
                second_value = second.model_dump(mode="json")
                if first_value == second_value:
                    routes.append(
                        {
                            **base,
                            **first_value,
                            "origin": "contrasted",
                            "verification_status": "confirmed",
                            "confidence_band": "high",
                        }
                    )
                else:
                    routes.append(
                        {
                            **base,
                            "summary": (
                                "Las lecturas institucionales requieren validación."
                            ),
                            "steps": [],
                            "provider_options": {
                                "gpt": first_value,
                                "claude": second_value,
                            },
                            "origin": "contrasted",
                            "verification_status": "inconsistent",
                            "confidence_band": "low",
                        }
                    )
            elif first is not None or second is not None:
                only = first or second
                routes.append(
                    {
                        **base,
                        **only.model_dump(mode="json"),
                        "origin": "inferred",
                        "verification_status": "pending",
                        "confidence_band": "medium",
                    }
                )
            else:
                routes.append(
                    {
                        **base,
                        "summary": "No se obtuvo una lectura institucional válida.",
                        "steps": [],
                        "origin": "contrasted",
                        "verification_status": (
                            "inconsistent"
                            if gpt_errors or claude_errors
                            else "not_identified"
                        ),
                        "confidence_band": "low",
                    }
                )
        return routes, sorted(source_ids), gpt_errors + claude_errors

    @staticmethod
    def _reconcile_timeline(
        gpt: ProviderAnalysis | None,
        claude: ProviderAnalysis | None,
    ) -> list[dict[str, Any]]:
        first = {event.id: event for event in gpt.timeline} if gpt else {}
        second = {event.id: event for event in claude.timeline} if claude else {}
        events: list[dict[str, Any]] = []
        for event_id in sorted(set(first) | set(second)):
            gpt_event = first.get(event_id)
            claude_event = second.get(event_id)
            if gpt_event is not None and claude_event is not None:
                gpt_value = gpt_event.model_dump(mode="json")
                claude_value = claude_event.model_dump(mode="json")
                if gpt_value == claude_value:
                    events.append(
                        {
                            **gpt_value,
                            "origin": "contrasted",
                            "verification_status": "confirmed",
                            "confidence_band": "high",
                        }
                    )
                else:
                    events.append(
                        {
                            "id": event_id,
                            "title": "Lecturas temporales diferentes",
                            "description": (
                                "GPT y Claude ubicaron este evento de forma distinta."
                            ),
                            "start_ms": min(
                                gpt_event.start_ms, claude_event.start_ms
                            ),
                            "end_ms": max(gpt_event.end_ms, claude_event.end_ms),
                            "provider_options": {
                                "gpt": gpt_value,
                                "claude": claude_value,
                            },
                            "origin": "contrasted",
                            "verification_status": "inconsistent",
                            "confidence_band": "low",
                        }
                    )
            else:
                only = gpt_event or claude_event
                events.append(
                    {
                        **only.model_dump(mode="json"),
                        "origin": "inferred",
                        "verification_status": "pending",
                        "confidence_band": "medium",
                    }
                )
        return events

    def _persist_uploaded_case(
        self,
        session: Session,
        *,
        analysis: Analysis,
        facts: list[dict[str, Any]],
        routes: list[dict[str, Any]],
    ) -> str:
        case_id = str(uuid4())
        session.add(
            CaseRecord(
                id=case_id,
                analysis_id=analysis.id,
                video_id=analysis.video_id,
                status="in_review",
                recommendation_status="preliminary",
            )
        )
        for value in facts:
            encrypted = self.cipher.encrypt_json(value["id"], "fact", value)
            session.add(
                Fact(
                    id=value["id"],
                    case_id=case_id,
                    fact_type=value["key"],
                    origin=value["origin"],
                    verification_status=value["verification_status"],
                    confidence_band=value["confidence_band"],
                    is_critical=value["is_critical"],
                    key_version=encrypted.key_version,
                    nonce=encrypted.nonce,
                    ciphertext=encrypted.ciphertext,
                )
            )
        for value in routes:
            source_ids = [
                claim["source_entry_id"]
                for step in value.get("steps", [])
                for claim in step.get("claims", [])
            ]
            self.rag.validate_source_ids(source_ids)
            encrypted = self.cipher.encrypt_json(value["id"], "route", value)
            session.add(
                Route(
                    id=value["id"],
                    case_id=case_id,
                    route_type=value["route_type"],
                    verification_status=value["verification_status"],
                    confidence_band=value["confidence_band"],
                    key_version=encrypted.key_version,
                    nonce=encrypted.nonce,
                    ciphertext=encrypted.ciphertext,
                )
            )
        session.flush()
        return case_id

    def _run_uploaded(self, analysis_id: str) -> None:
        if self.video_service is None:
            self._finish_unavailable(
                analysis_id,
                from_stage=AnalysisStage.AUDIO,
                reason="video_service_not_configured",
            )
            return
        if self.media is None:
            self._finish_unavailable(
                analysis_id,
                from_stage=AnalysisStage.AUDIO,
                reason="audio_extractor_not_configured",
            )
            return
        # La extracción ocurre dentro de la sesión: el vídeo carga sus bloques
        # cifrados de forma perezosa y fuera de ella quedaría desprendido.
        # Los bloques se materializan aquí para que un fallo de extracción se
        # reporte en la etapa de audio y no a mitad de la transcripción.
        extraction_error: Exception | None = None
        chunks: list[Any] = []
        with self.database.session() as session:
            analysis = session.get(Analysis, analysis_id)
            video = session.get(Video, analysis.video_id)
            video_id = video.id
            try:
                chunks = list(self.media.iter_audio_chunks(video))
            except (
                MediaValidationError,
                MediaToolUnavailableError,
                NoAudioError,
                OSError,
                ValueError,
            ) as exc:
                extraction_error = exc
        if extraction_error is not None:
            self._append_event(
                analysis_id,
                AnalysisStage.AUDIO,
                {"state": "failed", "reason": type(extraction_error).__name__},
                state="failed",
            )
            self._finish_unavailable(
                analysis_id,
                from_stage=AnalysisStage.TRANSCRIPTION,
                reason="audio_unavailable",
            )
            return
        self._append_event(
            analysis_id,
            AnalysisStage.AUDIO,
            {
                "state": "completed",
                "audio_present": True,
                "audio_bytes": sum(len(chunk.wav_bytes) for chunk in chunks),
            },
        )
        if self.transcription is None:
            self._finish_unavailable(
                analysis_id,
                from_stage=AnalysisStage.TRANSCRIPTION,
                reason="whisper_not_configured",
            )
            return
        try:
            transcript: TranscriptResult = retry_call(
                lambda: self.transcription.transcribe(
                    analysis_id=analysis_id,
                    video_id=video_id,
                    chunks=chunks,
                ),
                attempts=self.retry_attempts,
                retryable=(TimeoutError, ConnectionError),
            )
        # Igual que en la lectura de proveedores: un fallo de Whisper deja el
        # caso sin transcripción, pero nunca derriba el análisis.
        except Exception as exc:  # noqa: BLE001
            self._append_event(
                analysis_id,
                AnalysisStage.TRANSCRIPTION,
                {"state": "failed", "reason": type(exc).__name__},
                state="failed",
            )
            self._finish_unavailable(
                analysis_id,
                from_stage=AnalysisStage.PEOPLE_PLACES,
                reason="transcription_unavailable",
            )
            return
        self._append_event(
            analysis_id,
            AnalysisStage.TRANSCRIPTION,
            {
                "state": "completed",
                "model": "whisper-1",
                "segments": [
                    segment.model_dump(mode="json")
                    for segment in transcript.segments
                ],
            },
        )
        # La clasificación se calcula ANTES de leer con los proveedores. Antes
        # iba después, así que las rutas se construían sin saber de qué tipo de
        # desplazamiento se trataba y salían intercambiables entre casos.
        try:
            classification = self.beto.classify(transcript.text)
        except (ValueError, RuntimeError) as exc:
            from app.ai.contracts import BetoClassification

            classification = BetoClassification(
                status="unavailable",
                unavailable_reason=type(exc).__name__,
            )
        classification_input = (
            classification.model_dump(mode="json")
            if classification.status == "available"
            else None
        )
        # El catálogo se recupera una vez y se entrega a ambos proveedores:
        # es lo que les permite citar fuentes reales en lugar de inventarlas.
        catalog = self.rag.groundable()
        # Cribado en su propia llamada, antes del análisis: quien juzga si hay
        # caso no puede ser el mismo prompt que tiene el encargo de encontrar
        # hechos y rutas. Si falla, el análisis sigue sin él —perder el cribado
        # degrada la decisión, no debe tumbar el caso.
        screening = None
        if self.gpt is not None:
            try:
                screening = self.gpt.screen(transcript.segments)
            except Exception as exc:
                logger.warning(
                    "screening_failed",
                    extra={"error_code": type(exc).__name__},
                )
        gpt_reading, gpt_error = self._read_provider(
            self.gpt, transcript.segments, catalog, classification_input
        )
        claude_reading, claude_error = self._read_provider(
            self.claude, transcript.segments, catalog, classification_input
        )
        gpt_signals = self._signals_by_key(gpt_reading)
        claude_signals = self._signals_by_key(claude_reading)
        known_segments = {segment.id for segment in transcript.segments}
        facts: list[dict[str, Any]] = []
        for key in sorted(set(gpt_signals) | set(claude_signals)):
            reconciled = reconcile_readings(
                gpt=gpt_signals.get(key),
                claude=claude_signals.get(key),
                known_segments=known_segments,
            ).model_dump(mode="json")
            facts.append(
                {
                    "id": str(uuid4()),
                    **reconciled,
                    "is_critical": key in CRITICAL_KEYS,
                }
            )
        people_places = [
            fact for fact in facts if fact["key"] in PEOPLE_PLACE_KEYS
        ]
        dates_facts = [
            fact for fact in facts if fact["key"] not in PEOPLE_PLACE_KEYS
        ]
        self._append_event(
            analysis_id,
            AnalysisStage.PEOPLE_PLACES,
            {
                "state": "completed",
                "facts": people_places,
                "provider_errors": {
                    "gpt": gpt_error,
                    "claude": claude_error,
                },
            },
        )
        self._append_event(
            analysis_id,
            AnalysisStage.DATES_FACTS,
            {"state": "completed", "facts": dates_facts},
        )
        # El evento se emite aquí, en su lugar de siempre dentro de la
        # secuencia: sólo el cálculo se adelantó.
        self._append_event(
            analysis_id,
            AnalysisStage.CLASSIFICATION,
            {
                "state": (
                    "completed"
                    if classification.status == "available"
                    else "unavailable"
                ),
                "model": "BETO",
                "scope": "category_subcategory_only",
                "classification": classification.model_dump(mode="json"),
            },
            state=(
                "completed"
                if classification.status == "available"
                else "unavailable"
            ),
        )
        routes, source_ids, grounding_errors = self._reconcile_routes(
            gpt_reading,
            claude_reading,
        )
        sources = [
            self.rag.get(source_id).model_dump(mode="json")
            for source_id in source_ids
        ]
        self._append_event(
            analysis_id,
            AnalysisStage.SOURCES,
            {
                "state": "completed",
                "sources": sources,
                "grounding_errors": grounding_errors,
            },
        )
        timeline = self._reconcile_timeline(gpt_reading, claude_reading)
        self._append_event(
            analysis_id,
            AnalysisStage.TIMELINE,
            {"state": "completed", "events": timeline},
        )
        # Las rutas ya vienen calculadas —salen de la misma llamada al modelo que
        # todo lo demás—, así que lo que se decide aquí no es si generarlas sino
        # si entregarlas. A una receta de cocina el sistema le armaba tres rutas
        # institucionales y le decía "esta ruta aplica por la clasificación de
        # amenazas y control social contra la población".
        admissibility = evaluate_admissibility(
            facts=facts,
            timeline=timeline,
            canonical_keys=PEOPLE_PLACE_KEYS | CRITICAL_KEYS,
            screening=resolve_screening(screening, known_segments),
        )
        if not admissibility.admissible:
            routes = []

        critical_inconsistencies = sum(
            fact["is_critical"]
            and fact["verification_status"] == "inconsistent"
            for fact in facts
        ) + sum(
            route["verification_status"] == "inconsistent" for route in routes
        )
        with self.database.session() as session:
            analysis = session.get(Analysis, analysis_id)
            case_id = self._persist_uploaded_case(
                session,
                analysis=analysis,
                facts=facts,
                routes=routes,
            )
        self._append_event(
            analysis_id,
            AnalysisStage.ROUTES,
            {
                "state": "completed",
                "routes": routes,
                "case_id": case_id,
                "recommendation_status": (
                    "preliminary" if admissibility.admissible else "not_applicable"
                ),
                "critical_inconsistencies": critical_inconsistencies,
                "admissibility": admissibility.model_dump(mode="json"),
            },
        )
        if self.memory_images is not None:
            try:
                self.memory_images.generate_initial(case_id, is_demo=False)
            except Exception:
                logger.exception(
                    "memory_image_generation_failed",
                    extra={"case_id": case_id},
                )
        partial = (
            gpt_reading is None
            or claude_reading is None
            or classification.status != "available"
        )
        with self.database.session() as session:
            analysis = session.get(Analysis, analysis_id)
            analysis.status = "partial" if partial else "completed"
            analysis.failure_code = (
                "partial_provider_failure" if partial else None
            )
            analysis.completed_at = datetime.now(timezone.utc)

    def event_stream(
        self,
        analysis_id: str,
        *,
        after_sequence: int,
    ) -> Iterator[str]:
        cursor = after_sequence
        while True:
            with self.database.session() as session:
                analysis = session.get(Analysis, analysis_id)
                if analysis is None:
                    return
                events = list(
                    session.scalars(
                        select(AnalysisEvent)
                        .where(
                            AnalysisEvent.analysis_id == analysis_id,
                            AnalysisEvent.sequence > cursor,
                        )
                        .order_by(AnalysisEvent.sequence)
                    )
                )
                terminal = analysis.status in TERMINAL_ANALYSIS_STATES
                event_values = [
                    (
                        event.sequence,
                        event.stage,
                        event.state,
                        self._read_payload(event),
                    )
                    for event in events
                ]
            for sequence, stage, state, payload in event_values:
                cursor = sequence
                data = json.dumps(
                    {"stage": stage, "state": state, "payload": payload},
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                yield f"id: {sequence}\nevent: {stage}\ndata: {data}\n\n"
            if terminal:
                return
            if not event_values:
                yield ": keep-alive\n\n"
            time.sleep(0.15)

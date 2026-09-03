from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import struct
from typing import Any, Literal
from uuid import uuid4
import tempfile

from cryptography.exceptions import InvalidTag
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.attributes import set_committed_value
from sqlalchemy.orm import Session

from app.ai.memory_images import (
    GeneratedImage,
    VisualContext,
    build_memory_prompt,
    build_visual_context,
)
from app.database import Database
from app.entities import AnalysisEvent, CaseRecord, Fact, MemoryImage, RenderedVideo, User, Video
from app.security.crypto import EnvelopeCipher
from app.services.assets import EncryptedAssetStore, StoredAsset
from app.services.audit import AuditService
from app.services.memory_caption import compose_caption
from app.services.memory_video import MemoryVideoRenderer
from app.services.reference_frames import (
    ReferenceFrameExtractor,
    ReferenceFrameUnavailable,
)
from app.services.purges import PurgeService
from app.services.videos import VideoService


logger = logging.getLogger(__name__)

_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
_METADATA_PURPOSE = "memory_image_metadata"
_ASSET_PURPOSE = "memory-image"

# Una generación que murió a mitad —el proceso se cayó, el contenedor se
# reinició— deja su fila en `generating` para siempre, y el índice parcial de
# `memory_images` impide crear otra para el mismo caso: ese caso se quedaba sin
# cierre y sin forma de pedirlo. Pasado este plazo la fila se da por perdida.
# El margen es amplio a propósito: generar tarda más de un minuto y jamás debe
# desalojarse una generación que sigue viva.
_ABANDONED_GENERATION_SECONDS = 15 * 60


def _is_abandoned(image: MemoryImage, *, now: datetime | None = None) -> bool:
    """¿Lleva esta generación tanto parada que nadie la va a terminar?"""
    reference = now or datetime.now(timezone.utc)
    touched = image.updated_at or image.created_at
    if touched is None:
        return False
    # SQLite devuelve la marca sin zona; compararla tal cual restaría horas.
    if touched.tzinfo is None:
        touched = touched.replace(tzinfo=timezone.utc)
    return (reference - touched).total_seconds() >= _ABANDONED_GENERATION_SECONDS


@dataclass(frozen=True)
class _GenerationWork:
    image_id: str
    prompt: str
    metadata: dict[str, Any]
    is_demo: bool
    reference: bytes | None = None
    phrase: str = ""
    context_line: str = ""


@dataclass(frozen=True)
class _ExistingGeneration:
    image_id: str


@dataclass(frozen=True)
class _RenderWork:
    rendered_id: str
    attempt_id: str
    image_id: str
    case_id: str
    image: MemoryImage
    video: Video


class MemoryImageConflictError(ValueError):
    pass


class MemoryImageAssetUnavailableError(ValueError):
    pass


class MemoryImageService:
    def __init__(
        self,
        *,
        database: Database,
        cipher: EnvelopeCipher,
        assets: EncryptedAssetStore,
        adapter: Any | None,
        phrase_adapter: Any | None = None,
        audit: AuditService,
        model: str,
        prompt_version: str,
        demo_image_path: Path,
        video_service: VideoService | None = None,
        renderer: MemoryVideoRenderer | None = None,
        purges: PurgeService | None = None,
    ) -> None:
        self.database = database
        self.cipher = cipher
        self.assets = assets
        self.adapter = adapter
        self.phrase_adapter = phrase_adapter
        self.audit = audit
        self.model = model
        self.prompt_version = prompt_version
        self.demo_image_path = Path(demo_image_path)
        self.reference_frames = (
            ReferenceFrameExtractor(video_service=video_service)
            if video_service is not None
            else None
        )
        self.video_service = video_service
        self.renderer = renderer
        self.purges = purges

    def generate_initial(self, case_id: str, *, is_demo: bool) -> None:
        claim = self._claim_generation(
            case_id,
            is_demo=is_demo,
            actor=None,
        )
        if not isinstance(claim, _GenerationWork):
            return
        self._generate(claim)

    def regenerate(self, case_id: str, actor: User) -> MemoryImage:
        claim = self._claim_generation(case_id, is_demo=False, actor=actor)
        if isinstance(claim, _ExistingGeneration):
            return self._get_image(claim.image_id)
        if claim is None:
            raise RuntimeError("regeneration claim unexpectedly missing")
        return self._generate(claim)

    def active_for_case(self, session: Session, case_id: str) -> MemoryImage | None:
        return session.scalar(
            select(MemoryImage)
            .where(MemoryImage.case_id == case_id)
            .order_by(MemoryImage.generation.desc())
            .limit(1)
        )

    def read_image(self, image: MemoryImage) -> bytes:
        if (
            image.asset_key_version is None
            or image.asset_nonce is None
            or image.storage_path is None
            or image.plaintext_size is None
            or image.ciphertext_size is None
        ):
            raise MemoryImageAssetUnavailableError("memory image asset is unavailable")
        try:
            return self.assets.read(
                image.id,
                _ASSET_PURPOSE,
                StoredAsset(
                    key_version=image.asset_key_version,
                    nonce=image.asset_nonce,
                    storage_path=image.storage_path,
                    plaintext_size=image.plaintext_size,
                    ciphertext_size=image.ciphertext_size,
                ),
            )
        except (InvalidTag, KeyError, OSError, ValueError) as exc:
            raise MemoryImageAssetUnavailableError(
                "memory image asset is unavailable"
            ) from exc

    def decide(
        self,
        session: Session,
        *,
        image: MemoryImage,
        action: Literal["approve", "reject"],
        actor: User,
    ) -> MemoryImage:
        reviewed_at = datetime.now(timezone.utc)
        metadata = self.cipher.decrypt_json(
            image.id,
            _METADATA_PURPOSE,
            image.encrypted_payload(),
        )
        if not isinstance(metadata, dict):
            raise TypeError("memory image metadata must be an object")
        metadata["decision"] = {
            "action": action,
            "reviewed_by_id": actor.id,
            "reviewed_at": reviewed_at.isoformat(),
        }
        encrypted = self.cipher.encrypt_json(image.id, _METADATA_PURPOSE, metadata)
        next_status = "approved" if action == "approve" else "rejected"
        latest_generation = (
            select(func.max(MemoryImage.generation))
            .where(MemoryImage.case_id == image.case_id)
            .scalar_subquery()
        )
        result = session.execute(
            update(MemoryImage)
            .where(
                MemoryImage.id == image.id,
                MemoryImage.case_id == image.case_id,
                MemoryImage.generation == latest_generation,
                MemoryImage.status == "pending_review",
            )
            .values(
                status=next_status,
                reviewed_by_id=actor.id,
                reviewed_at=reviewed_at,
                key_version=encrypted.key_version,
                nonce=encrypted.nonce,
                ciphertext=encrypted.ciphertext,
            )
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            raise MemoryImageConflictError(
                "La imagen de memoria ya no está pendiente de revisión"
            )
        set_committed_value(image, "status", next_status)
        set_committed_value(image, "reviewed_by_id", actor.id)
        set_committed_value(image, "reviewed_at", reviewed_at)
        set_committed_value(image, "key_version", encrypted.key_version)
        set_committed_value(image, "nonce", encrypted.nonce)
        set_committed_value(image, "ciphertext", encrypted.ciphertext)
        session.add(
            self.audit.build_record(
                actor_id=actor.id,
                actor_role=actor.role,
                action=f"memory_image_{'approved' if action == 'approve' else 'rejected'}",
                entity_type="memory_image",
                entity_id=image.id,
                details={"generation": image.generation},
            )
        )
        return image

    def render_approved(self, image_id: str) -> RenderedVideo | None:
        if self.video_service is None or self.renderer is None:
            raise RuntimeError("memory video rendering is not configured")
        claim = self._claim_render(image_id)
        if claim is None:
            return self._rendered_for_image(image_id)
        try:
            image_bytes = self.read_image(claim.image)
            with tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024, mode="w+b") as output:
                self.renderer.render(claim.video, image_bytes, output)
                with self.database.session() as session:
                    original = session.get(Video, claim.video.id)
                    if original is None:
                        raise KeyError(claim.video.id)
                    output.seek(0)
                    derived = self.video_service.create_derived(
                        session,
                        original=original,
                        source=output,
                        filename=f"cierre-memoria-{claim.image_id}.mp4",
                    )
                    completed = session.execute(
                        update(RenderedVideo)
                        .where(
                            RenderedVideo.id == claim.rendered_id,
                            RenderedVideo.memory_image_id == claim.image_id,
                            RenderedVideo.status == "rendering",
                            RenderedVideo.render_attempt_id == claim.attempt_id,
                        )
                        .values(
                            video_id=derived.id,
                            status="ready",
                            failure_code=None,
                        )
                        .execution_options(synchronize_session=False)
                    )
                    if completed.rowcount != 1:
                        self.video_service.discard_derived_storage(session, derived)
                        return None
                    rendered = session.get(RenderedVideo, claim.rendered_id)
                    if rendered is None:
                        raise KeyError(claim.rendered_id)
                    rendered.video_id = derived.id
                    rendered.status = "ready"
                    rendered.failure_code = None
                    return rendered
        except Exception:
            self._mark_render_failed(claim)
            return None

    def _claim_render(self, image_id: str) -> _RenderWork | None:
        attempt_id = str(uuid4())
        try:
            with self.database.session() as session:
                image = session.get(MemoryImage, image_id)
                if image is None or image.status != "approved":
                    return None
                latest_generation = session.scalar(
                    select(func.max(MemoryImage.generation)).where(
                        MemoryImage.case_id == image.case_id
                    )
                )
                if image.generation != latest_generation:
                    return None
                case = session.get(CaseRecord, image.case_id)
                if case is None or case.deletion_claimed_at is not None:
                    raise KeyError(image.case_id)
                video = session.get(Video, case.video_id)
                if video is None:
                    raise KeyError(case.video_id)
                rendered = session.scalar(
                    select(RenderedVideo).where(RenderedVideo.memory_image_id == image.id)
                )
                if rendered is None:
                    rendered_id = str(uuid4())
                    session.add(
                        RenderedVideo(
                            id=rendered_id,
                            memory_image_id=image.id,
                            case_id=image.case_id,
                            video_id=None,
                            status="rendering",
                            render_attempt_id=attempt_id,
                        )
                    )
                    session.flush()
                else:
                    if rendered.status in {"ready", "rendering"}:
                        return None
                    claimed = session.execute(
                        update(RenderedVideo)
                        .where(
                            RenderedVideo.id == rendered.id,
                            RenderedVideo.memory_image_id == image.id,
                            RenderedVideo.status == "failed",
                        )
                        .values(
                            status="rendering",
                            render_attempt_id=attempt_id,
                            failure_code=None,
                        )
                        .execution_options(synchronize_session=False)
                    )
                    if claimed.rowcount != 1:
                        return None
                    rendered_id = rendered.id
                list(video.chunks)
                return _RenderWork(
                    rendered_id=rendered_id,
                    attempt_id=attempt_id,
                    image_id=image.id,
                    case_id=image.case_id,
                    image=image,
                    video=video,
                )
        except IntegrityError:
            return None

    def _mark_render_failed(self, claim: _RenderWork) -> None:
        with self.database.session() as session:
            session.execute(
                update(RenderedVideo)
                .where(
                    RenderedVideo.id == claim.rendered_id,
                    RenderedVideo.status == "rendering",
                    RenderedVideo.render_attempt_id == claim.attempt_id,
                )
                .values(status="failed", failure_code="memory_video_render_failed")
                .execution_options(synchronize_session=False)
            )

    def _rendered_for_image(self, image_id: str) -> RenderedVideo | None:
        with self.database.session() as session:
            return session.scalar(
                select(RenderedVideo).where(RenderedVideo.memory_image_id == image_id)
            )

    def _claim_generation(
        self,
        case_id: str,
        *,
        is_demo: bool,
        actor: User | None,
    ) -> _GenerationWork | _ExistingGeneration | None:
        try:
            with self.database.session() as session:
                case = session.scalar(
                    select(CaseRecord)
                    .where(CaseRecord.id == case_id)
                    .with_for_update()
                )
                if case is None:
                    raise KeyError(case_id)
                if case.deletion_claimed_at is not None or case.status == "deleting":
                    if actor is None:
                        return None
                    raise MemoryImageConflictError("El caso está en eliminación")
                if actor is None:
                    existing = session.scalar(
                        select(MemoryImage.id)
                        .where(MemoryImage.case_id == case_id)
                        .limit(1)
                    )
                    if existing is not None:
                        return None
                else:
                    video = session.get(Video, case.video_id)
                    if video is None:
                        raise KeyError(case.video_id)
                    is_demo = video.is_demo
                    active = session.scalar(
                        select(MemoryImage)
                        .where(
                            MemoryImage.case_id == case_id,
                            MemoryImage.status == "generating",
                        )
                        .order_by(MemoryImage.generation.desc())
                        .limit(1)
                    )
                    if active is not None and not _is_abandoned(active):
                        return _ExistingGeneration(image_id=active.id)
                    if active is not None:
                        # Nadie va a terminarla: liberarla es lo único que
                        # devuelve el caso a un estado del que se puede salir.
                        active.status = "failed"
                        active.failure_code = "generation_abandoned"
                        session.flush()
                    previous = session.scalar(
                        select(MemoryImage)
                        .where(
                            MemoryImage.case_id == case_id,
                            MemoryImage.status == "pending_review",
                        )
                        .order_by(MemoryImage.generation.desc())
                        .limit(1)
                    )
                    if previous is not None:
                        previous.status = "rejected"
                        session.flush()

                context = self._visual_context(session, case)
                # El fotograma se toma aqui, dentro de la transaccion, porque el
                # prompt guardado en los metadatos tiene que ser el que de verdad
                # se envio. Descifrar el video y llamar a ffmpeg tarda unos
                # segundos; con un solo analista trabajando es asumible, y si un
                # dia deja de serlo esto se mueve fuera de la sesion.
                reference = (
                    None if is_demo else self._reference_frame(session, case.video_id)
                )
                prompt = build_memory_prompt(context, with_reference=reference is not None)
                phrase, context_line = self._memory_phrase(context, is_demo=is_demo)
                image_id = str(uuid4())
                metadata: dict[str, Any] = {
                    "context": asdict(context),
                    "prompt": prompt,
                    "reference_frame": reference is not None,
                    "phrase": phrase,
                    "context_line": context_line,
                }
                encrypted = self.cipher.encrypt_json(image_id, _METADATA_PURPOSE, metadata)
                last_generation = session.scalar(
                    select(func.max(MemoryImage.generation)).where(
                        MemoryImage.case_id == case_id
                    )
                )
                image = MemoryImage(
                    id=image_id,
                    case_id=case_id,
                    generation=int(last_generation or 0) + 1,
                    status="generating",
                    provider="demo" if is_demo else (
                        "openai" if self.adapter else "unconfigured"
                    ),
                    model=self.model,
                    prompt_version=self.prompt_version,
                    context_hash=self.cipher.fingerprint(
                        json.dumps(asdict(context), ensure_ascii=False, sort_keys=True),
                        purpose="memory-image-context",
                    ),
                    key_version=encrypted.key_version,
                    nonce=encrypted.nonce,
                    ciphertext=encrypted.ciphertext,
                )
                session.add(image)
                session.add(
                    self.audit.build_record(
                        actor_id=actor.id if actor is not None else None,
                        actor_role=actor.role if actor is not None else "system",
                        action=(
                            "memory_image_regeneration_started"
                            if actor
                            else "memory_image_generation_started"
                        ),
                        entity_type="memory_image",
                        entity_id=image_id,
                        details={"case_id": case_id, "generation": image.generation},
                    )
                )
                if actor is not None:
                    session.add(
                        self.audit.build_record(
                            actor_id=actor.id,
                            actor_role=actor.role,
                            action="memory_image_regenerated",
                            entity_type="memory_image",
                            entity_id=image_id,
                            details={"generation": image.generation},
                        )
                    )
                session.flush()
        except IntegrityError:
            if actor is None:
                return None
            return _ExistingGeneration(image_id=self._latest_image_id(case_id))
        return _GenerationWork(
            image_id=image_id,
            prompt=prompt,
            metadata=metadata,
            is_demo=is_demo,
            reference=reference,
            phrase=phrase,
            context_line=context_line,
        )

    def _latest_image_id(self, case_id: str) -> str:
        with self.database.session() as session:
            image_id = session.scalar(
                select(MemoryImage.id)
                .where(MemoryImage.case_id == case_id)
                .order_by(MemoryImage.generation.desc())
                .limit(1)
            )
        if image_id is None:
            raise KeyError(case_id)
        return image_id

    def _get_image(self, image_id: str) -> MemoryImage:
        with self.database.session() as session:
            image = session.get(MemoryImage, image_id)
        if image is None:
            raise KeyError(image_id)
        return image

    def _reference_frame(self, session: Any, video_id: str) -> bytes | None:
        """Fotograma del testimonio para anclar la ilustracion, o None.

        Nunca interrumpe la generacion: si no hay servicio de video, si ffmpeg no
        esta, si el video no se puede leer o si ningun cuadro trae informacion
        suficiente, el cierre se dibuja como siempre, solo con el contexto.
        """
        if self.reference_frames is None:
            return None
        try:
            video = session.get(Video, video_id)
            if video is None:
                return None
            return self.reference_frames.extract(video).data
        except (ReferenceFrameUnavailable, OSError, ValueError):
            return None

    def _visual_context(self, session: Any, case: CaseRecord) -> VisualContext:
        event = session.scalar(
            select(AnalysisEvent)
            .where(
                AnalysisEvent.analysis_id == case.analysis_id,
                AnalysisEvent.stage == "classification",
            )
            .order_by(AnalysisEvent.sequence.desc())
            .limit(1)
        )
        if event is None:
            raise ValueError("classification event is required")
        payload = self.cipher.decrypt_json(
            f"{case.analysis_id}:{event.sequence}",
            "analysis_event",
            event.encrypted_payload(),
        )
        if not isinstance(payload, dict):
            raise ValueError("classification event must be an object")
        classification = payload.get("classification", payload)
        if not isinstance(classification, dict):
            raise ValueError("classification payload must be an object")
        facts: list[dict[str, Any]] = []
        for fact in session.scalars(select(Fact).where(Fact.case_id == case.id)):
            value = self.cipher.decrypt_json(fact.id, "fact", fact.encrypted_payload())
            if isinstance(value, dict):
                facts.append(value)
        return build_visual_context(classification, facts)

    def _generate(self, work: _GenerationWork) -> MemoryImage:
        try:
            generated = self._source_image(work)
            # La frase se sobreimprime aqui, sobre la lamina ya recibida: el
            # modelo de imagen no escribe el texto porque deforma las tildes.
            generated = GeneratedImage(
                data=compose_caption(generated.data, work.phrase, work.context_line),
                mime_type=generated.mime_type,
            )
            width, height = _png_dimensions(generated.data)
            if generated.mime_type != "image/png" or (width, height) != (1536, 864):
                raise ValueError("memory image must be a 1536x864 PNG")
            stored = self.assets.write(work.image_id, _ASSET_PURPOSE, generated.data)
        except Exception as exc:
            code = (
                "image_provider_not_configured"
                if not work.is_demo and self.adapter is None
                else "image_generation_failed"
            )
            return self._mark_failed(work, failure_code=code, diagnostic=type(exc).__name__)
        return self._mark_pending(work.image_id, stored, generated, width, height)

    def _memory_phrase(self, context: Any, *, is_demo: bool) -> tuple[str, str]:
        """La linea que se sobreimprime; vacia si no se puede escribir.

        Que falle el redactor no debe costar la lamina: sin frase la imagen
        sigue siendo un cierre valido, y el fallo queda en el log.
        """
        if is_demo or self.phrase_adapter is None:
            return "", ""
        try:
            return self.phrase_adapter.write(context)
        except Exception:
            logger.exception("memory_phrase_failed")
            return "", ""

    def _source_image(self, work: _GenerationWork) -> GeneratedImage:
        if work.is_demo:
            return GeneratedImage(data=self.demo_image_path.read_bytes(), mime_type="image/png")
        if self.adapter is None:
            raise RuntimeError("image provider not configured")
        # El segundo argumento sólo se pasa cuando hay fotograma: un adaptador
        # con la firma antigua, generate(prompt), sigue funcionando igual.
        if work.reference is None:
            return self.adapter.generate(work.prompt)
        return self.adapter.generate(work.prompt, work.reference)

    def _mark_pending(
        self,
        image_id: str,
        stored: StoredAsset,
        generated: GeneratedImage,
        width: int,
        height: int,
    ) -> MemoryImage:
        lost_claim = False
        with self.database.session() as session:
            image = session.get(MemoryImage, image_id)
            if image is None:
                # A committed deletion claim may have removed the row while the
                # provider was generating. Persist cleanup before yielding the
                # descriptor; filesystem work is retried by the durable outbox.
                lost_claim = True
            else:
                case = session.get(CaseRecord, image.case_id)
                if case is None or case.deletion_claimed_at is not None:
                    lost_claim = True
            if lost_claim:
                pass
            else:
                image.status = "pending_review"
                image.image_mime_type = generated.mime_type
                image.image_width = width
                image.image_height = height
                image.plaintext_size = stored.plaintext_size
                image.asset_key_version = stored.key_version
                image.asset_nonce = stored.nonce
                image.storage_path = stored.storage_path
                image.ciphertext_size = stored.ciphertext_size
                session.add(
                    self.audit.build_record(
                        actor_id=None,
                        actor_role="system",
                        action="memory_image_generated",
                        entity_type="memory_image",
                        entity_id=image_id,
                        details={"generation": image.generation},
                    )
                )
                return image
        self._enqueue_asset_compensation(image_id, stored)
        raise KeyError(image_id)

    def _enqueue_asset_compensation(self, image_id: str, stored: StoredAsset) -> None:
        if self.purges is None:
            raise RuntimeError("purge service is required for image compensation")
        self.purges.enqueue_asset_now(asset_id=image_id, asset=stored)
        self.purges.process_pending()

    def _mark_failed(
        self,
        work: _GenerationWork,
        *,
        failure_code: str,
        diagnostic: str,
    ) -> MemoryImage:
        with self.database.session() as session:
            image = session.get(MemoryImage, work.image_id)
            if image is None:
                raise KeyError(work.image_id)
            metadata = {**work.metadata, "diagnostic": diagnostic}
            encrypted = self.cipher.encrypt_json(
                image.id, _METADATA_PURPOSE, metadata
            )
            image.status = "failed"
            image.failure_code = failure_code
            image.key_version = encrypted.key_version
            image.nonce = encrypted.nonce
            image.ciphertext = encrypted.ciphertext
            session.add(
                self.audit.build_record(
                    actor_id=None,
                    actor_role="system",
                    action="memory_image_generation_failed",
                    entity_type="memory_image",
                    entity_id=image.id,
                    details={"failure_code": failure_code},
                )
            )
            return image


def _png_dimensions(data: bytes) -> tuple[int, int]:
    if len(data) < 24 or not data.startswith(_PNG_SIGNATURE) or data[12:16] != b"IHDR":
        raise ValueError("invalid PNG")
    return struct.unpack(">II", data[16:24])

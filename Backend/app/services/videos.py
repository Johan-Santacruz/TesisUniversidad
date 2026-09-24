from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import BinaryIO, Iterator
from uuid import uuid4

from sqlalchemy import and_, or_, update
from sqlalchemy.orm import Session

from app.config import Settings
from app.database import Database
from app.entities import User, Video, VideoChunk
from app.security.crypto import ChunkCipher, ChunkManifest, EncryptedChunk
from app.services.audit import AuditService
from app.services.media import (
    MediaMetadata,
    MediaTooLargeError,
    MediaValidator,
    UnsupportedMediaError,
)
from app.services.purges import PurgeService


# Un video que se registró con su audio y cuyo archivo todavía no llega. En
# "storing" una subida ya lo reclamó y lo está validando y cifrando.
RECEIVING_STATUSES = frozenset({"receiving", "storing"})
# Si el proceso muere a mitad de un cifrado, el reclamo caduca y se puede subir
# de nuevo. Cifrar 500 MB tarda segundos; quince minutos es holgura de sobra.
STORING_LEASE = timedelta(minutes=15)
# Lo que el navegador decodifica y lo que el contenedor declara no coinciden al
# milisegundo: el relleno inicial del AAC, las listas de edición del MOV. Una
# grabación distinta sí se va segundos de largo.
AUDIO_MATCH_TOLERANCE_MS = 1500
DECLARED_MEDIA_TYPES = frozenset(
    {"", "video/mp4", "video/quicktime", "video/webm", "application/octet-stream"}
)


class InvalidVideoError(ValueError):
    pass


class VideoTooLargeError(ValueError):
    pass


class AudioTooLargeError(ValueError):
    pass


class VideoNotAwaitedError(ValueError):
    """El video ya llegó, o no se registró esperando su archivo."""


class AudioMismatchError(ValueError):
    """El archivo que llegó no es la grabación cuyo audio se analizó."""


class VideoService:
    def __init__(
        self,
        *,
        settings: Settings,
        chunk_cipher: ChunkCipher,
        audit: AuditService,
        media_validator: MediaValidator | None = None,
        purges: PurgeService | None = None,
    ) -> None:
        self.settings = settings
        self.chunk_cipher = chunk_cipher
        self.audit = audit
        self.media_validator = media_validator or MediaValidator()
        self.purges = purges
        self.video_root = settings.storage_dir / "videos"

    def create(
        self,
        session: Session,
        *,
        user: User,
        source: BinaryIO,
        is_demo: bool = False,
    ) -> Video:
        try:
            metadata = self.media_validator.validate(
                source,
                self.settings.max_video_bytes,
            )
        except MediaTooLargeError as exc:
            raise VideoTooLargeError(str(exc)) from exc
        except UnsupportedMediaError as exc:
            raise InvalidVideoError(str(exc)) from exc
        media_type = metadata.media_type

        return self._persist(
            session,
            owner_id=user.id,
            source=source,
            media_type=media_type,
            filename=self._filename(media_type),
            status="uploaded",
            is_demo=is_demo,
            delete_after=None,
            audit_user=user,
        )

    def create_derived(
        self,
        session: Session,
        *,
        original: Video,
        source: BinaryIO,
        filename: str,
    ) -> Video:
        try:
            metadata = self.media_validator.validate(source, self.settings.max_video_bytes)
        except (MediaTooLargeError, UnsupportedMediaError) as exc:
            raise InvalidVideoError(str(exc)) from exc
        if metadata.media_type != "video/mp4":
            raise InvalidVideoError("derived video must be MP4")
        return self._persist(
            session,
            owner_id=original.owner_id,
            source=source,
            media_type="video/mp4",
            filename=filename,
            status="derived",
            is_demo=original.is_demo,
            delete_after=original.delete_after,
            audit_user=None,
        )

    def create_receiving(
        self,
        session: Session,
        *,
        user: User,
        audio: BinaryIO,
        media_type: str,
        size_bytes: int,
    ) -> Video:
        """Registra un video por su audio, antes de que llegue el archivo.

        Subir el video de un celular tarda minutos y el análisis sólo necesita
        el audio, que pesa decenas de veces menos. El navegador lo separa y lo
        manda primero; el video sigue subiendo mientras el análisis corre y se
        entrega después por `attach_content`. El tamaño se revisa ya, con lo que
        declara el navegador: analizar un video que luego se va a rechazar por
        grande sería gastar el análisis.
        """
        declared_type = (media_type or "").strip().lower()
        if declared_type not in DECLARED_MEDIA_TYPES:
            raise InvalidVideoError("unsupported media type")
        if size_bytes <= 0:
            raise InvalidVideoError("video is empty")
        if size_bytes > self.settings.max_video_bytes:
            raise VideoTooLargeError("video exceeds configured size limit")
        try:
            duration_ms = self.media_validator.validate_audio(
                audio,
                self.settings.max_intake_audio_bytes,
            )
        except MediaTooLargeError as exc:
            raise AudioTooLargeError(str(exc)) from exc
        except UnsupportedMediaError as exc:
            raise InvalidVideoError(str(exc)) from exc
        # El tipo definitivo lo decide la firma del archivo cuando llegue; hasta
        # entonces vale el que declaró el navegador. MOV es un MP4 para ffprobe.
        provisional = "video/webm" if declared_type == "video/webm" else "video/mp4"
        video = Video(
            id=str(uuid4()),
            owner_id=user.id,
            filename=self._filename(provisional),
            media_type=provisional,
            size_bytes=0,
            chunk_size=self.settings.video_chunk_bytes,
            key_version=self.chunk_cipher.current_version,
            status="receiving",
            is_demo=False,
            delete_after=None,
            audio_duration_ms=duration_ms,
        )
        session.add(video)
        session.add(
            self.audit.build_record(
                actor_id=user.id,
                actor_role=user.role,
                action="video_audio_received",
                entity_type="video",
                entity_id=video.id,
                details={"audio_duration_ms": duration_ms},
            )
        )
        session.flush()
        return video

    def claim_receiving(
        self, session: Session, video_id: str, *, now: datetime | None = None
    ) -> bool:
        """Reclama el video para una subida. Dos a la vez escribirían los
        mismos bloques en el mismo directorio."""
        now = now or datetime.now(timezone.utc)
        claimed = session.execute(
            update(Video)
            .where(
                Video.id == video_id,
                or_(
                    Video.status == "receiving",
                    and_(
                        Video.status == "storing",
                        Video.updated_at <= now - STORING_LEASE,
                    ),
                ),
            )
            .values(status="storing", updated_at=now)
            .execution_options(synchronize_session=False)
        )
        return claimed.rowcount == 1

    @staticmethod
    def release_receiving(session: Session, video_id: str) -> None:
        session.execute(
            update(Video)
            .where(Video.id == video_id, Video.status == "storing")
            .values(status="receiving")
            .execution_options(synchronize_session=False)
        )

    def attach_content(
        self,
        session: Session,
        *,
        video: Video,
        source: BinaryIO,
        user: User,
    ) -> Video:
        """Guarda el archivo de un video que se analizó por su audio.

        Pide el reclamo de `claim_receiving` ya confirmado. Antes de cifrar nada
        comprueba que el audio del archivo dure lo mismo que el que se analizó:
        si no, el caso mostraría un video que no es el que se leyó.
        """
        try:
            metadata = self.media_validator.validate(
                source,
                self.settings.max_video_bytes,
            )
        except MediaTooLargeError as exc:
            raise VideoTooLargeError(str(exc)) from exc
        except UnsupportedMediaError as exc:
            raise InvalidVideoError(str(exc)) from exc
        difference_ms = self._audio_difference_ms(video, metadata)
        # Un intento anterior que murió a mitad pudo dejar bloques cifrados en
        # el directorio, y el cifrado exige encontrarlo vacío.
        if self.purges is not None and self.purges.discover_video_storage_paths(video.id):
            self._enqueue_partial_storage(video.id)
        manifest = self._encrypt(session, video.id, source)
        stored = session.execute(
            update(Video)
            .where(Video.id == video.id, Video.status == "storing")
            .values(
                status="uploaded",
                media_type=metadata.media_type,
                filename=self._filename(metadata.media_type),
                size_bytes=manifest.total_size,
                chunk_size=manifest.chunk_size,
                key_version=self.chunk_cipher.current_version,
            )
            .execution_options(synchronize_session=False)
        )
        if stored.rowcount != 1:
            # El caso se eliminó mientras se cifraba. Al deshacer la
            # transacción, los bloques recién escritos entran a la purga.
            raise VideoNotAwaitedError("video is no longer waiting for its content")
        self._add_chunks(session, video.id, manifest)
        session.add(
            self.audit.build_record(
                actor_id=user.id,
                actor_role=user.role,
                action="video_content_received",
                entity_type="video",
                entity_id=video.id,
                details={"audio_difference_ms": difference_ms},
            )
        )
        session.flush()
        session.refresh(video)
        return video

    @staticmethod
    def _audio_difference_ms(video: Video, metadata: MediaMetadata) -> int | None:
        expected = video.audio_duration_ms
        if expected is None:
            return None
        actual = (
            metadata.audio_duration_ms
            if metadata.audio_duration_ms is not None
            else metadata.duration_ms
        )
        difference = abs(actual - expected)
        if difference > max(AUDIO_MATCH_TOLERANCE_MS, expected // 100):
            raise AudioMismatchError("video audio does not match the analyzed audio")
        return difference

    @staticmethod
    def _filename(media_type: str) -> str:
        return f"testimonio{'.webm' if media_type == 'video/webm' else '.mp4'}"

    def _encrypt(self, session: Session, video_id: str, source: BinaryIO) -> ChunkManifest:
        target_dir = self.video_root / video_id
        try:
            manifest = self.chunk_cipher.encrypt_stream(
                video_id,
                source,
                target_dir,
                chunk_size=self.settings.video_chunk_bytes,
                max_bytes=self.settings.max_video_bytes,
            )
        except Exception as exc:
            self._enqueue_partial_storage(video_id)
            if isinstance(exc, ValueError) and "size limit" in str(exc):
                raise VideoTooLargeError(str(exc)) from exc
            raise
        if manifest.total_size == 0:
            self._enqueue_partial_storage(video_id)
            raise InvalidVideoError("video is empty")
        storage_paths = [
            str(chunk.path.relative_to(self.settings.storage_dir)) for chunk in manifest.chunks
        ]
        self._track_pending_storage(session, video_id, storage_paths)
        return manifest

    def _add_chunks(self, session: Session, video_id: str, manifest: ChunkManifest) -> None:
        for chunk in manifest.chunks:
            session.add(
                VideoChunk(
                    video_id=video_id,
                    chunk_index=chunk.chunk_index,
                    byte_start=chunk.byte_start,
                    byte_end=chunk.byte_end,
                    key_version=chunk.key_version,
                    nonce=chunk.nonce,
                    storage_path=str(chunk.path.relative_to(self.settings.storage_dir)),
                    ciphertext_size=chunk.ciphertext_size,
                )
            )

    def _persist(
        self,
        session: Session,
        *,
        owner_id: str,
        source: BinaryIO,
        media_type: str,
        filename: str,
        status: str,
        is_demo: bool,
        delete_after: object,
        audit_user: User | None,
    ) -> Video:
        video_id = str(uuid4())
        manifest = self._encrypt(session, video_id, source)

        video = Video(
            id=video_id,
            owner_id=owner_id,
            filename=filename,
            media_type=media_type,
            size_bytes=manifest.total_size,
            chunk_size=manifest.chunk_size,
            key_version=self.chunk_cipher.current_version,
            status=status,
            is_demo=is_demo,
            delete_after=delete_after,
        )
        session.add(video)
        self._add_chunks(session, video_id, manifest)
        if audit_user is not None:
            session.add(
                self.audit.build_record(
                    actor_id=audit_user.id,
                    actor_role=audit_user.role,
                    action="video_uploaded",
                    entity_type="video",
                    entity_id=video.id,
                    details={"is_demo": is_demo},
                )
            )
        try:
            session.flush()
        except Exception:
            # Keep this entry tracked. Database.session invokes the root
            # rollback callback after the failed transaction releases its lock,
            # where the durable purge intent can be committed independently.
            raise
        return video

    def discard_derived_storage(self, session: Session, video: Video) -> None:
        """Remove an uncommitted derivative that lost its render claim."""
        paths = [chunk.storage_path for chunk in video.chunks]
        if self.purges is None:
            raise RuntimeError("purge service is required for video compensation")
        # The derivative rows and its purge intent commit together. Do not run
        # the filesystem worker until the root transaction has released locks.
        self.purges.enqueue_video(session, video_id=video.id, storage_paths=paths)
        Database.on_root_commit(session, self.purges.process_pending)
        session.delete(video)

    def _track_pending_storage(
        self, session: Session, video_id: str, storage_paths: list[str]
    ) -> None:
        key = "senda_pending_video_storage"
        pending = session.info.get(key)
        if pending is None:
            pending = {}
            session.info[key] = pending

            def clean_on_rollback() -> None:
                for pending_id, paths in tuple(pending.items()):
                    self._enqueue_compensation(pending_id, paths)

            def clear_on_commit() -> None:
                pending.clear()

            Database.on_root_rollback(session, clean_on_rollback)
            Database.on_root_commit(session, clear_on_commit)
        pending[video_id] = list(storage_paths)

    @staticmethod
    def _untrack_pending_storage(session: Session, video_id: str) -> None:
        pending = session.info.get("senda_pending_video_storage")
        if pending is not None:
            pending.pop(video_id, None)

    def _enqueue_compensation(self, video_id: str, storage_paths: list[str]) -> None:
        if self.purges is None:
            raise RuntimeError("purge service is required for video compensation")
        self.purges.enqueue_video_now(video_id=video_id, storage_paths=storage_paths)
        self.purges.process_pending()

    def _enqueue_partial_storage(self, video_id: str) -> None:
        if self.purges is None:
            raise RuntimeError("purge service is required for video compensation")
        self._enqueue_compensation(
            video_id,
            self.purges.discover_video_storage_paths(video_id),
        )

    def create_demo(self, session: Session, *, user: User) -> Video:
        fixture = (
            Path(__file__).resolve().parents[1]
            / "data"
            / "demo-fictitious.mp4"
        )
        with fixture.open("rb") as source:
            return self.create(
                session,
                user=user,
                source=source,
                is_demo=True,
            )

    def manifest(self, video: Video) -> ChunkManifest:
        chunks = tuple(
            EncryptedChunk(
                chunk_index=chunk.chunk_index,
                byte_start=chunk.byte_start,
                byte_end=chunk.byte_end,
                key_version=chunk.key_version,
                nonce=chunk.nonce,
                path=self.settings.storage_dir / chunk.storage_path,
                ciphertext_size=chunk.ciphertext_size,
            )
            for chunk in video.chunks
        )
        return ChunkManifest(
            total_size=video.size_bytes,
            chunk_size=video.chunk_size,
            chunks=chunks,
        )

    def open_plain_bytes(self, video: Video) -> bytes:
        if video.size_bytes == 0:
            return b""
        return self.chunk_cipher.read_range(
            video.id,
            self.manifest(video),
            0,
            video.size_bytes - 1,
        )

    def iter_plain_chunks(self, video: Video) -> Iterator[bytes]:
        if video.size_bytes <= 0:
            return
        yield from self.chunk_cipher.iter_range(
            video.id,
            self.manifest(video),
            0,
            video.size_bytes - 1,
        )


def parse_byte_range(value: str | None, total_size: int) -> tuple[int, int, bool]:
    if total_size <= 0:
        raise ValueError("video is empty")
    if value is None:
        return 0, total_size - 1, False
    if not value.startswith("bytes=") or "," in value:
        raise ValueError("only one byte range is supported")
    requested = value.removeprefix("bytes=")
    if "-" not in requested:
        raise ValueError("invalid byte range")
    start_text, end_text = requested.split("-", 1)
    try:
        if not start_text:
            suffix_length = int(end_text)
            if suffix_length <= 0:
                raise ValueError
            start = max(0, total_size - suffix_length)
            end = total_size - 1
        else:
            start = int(start_text)
            end = total_size - 1 if not end_text else int(end_text)
    except ValueError as exc:
        raise ValueError("invalid byte range") from exc
    if start < 0 or start >= total_size or end < start:
        raise ValueError("unsatisfiable byte range")
    return start, min(end, total_size - 1), True

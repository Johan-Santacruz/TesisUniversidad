from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import BinaryIO
import unicodedata
from uuid import uuid4

from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Consent, User, Video, VideoChunk
from app.schemas import DataKind
from app.security.crypto import (
    ChunkCipher,
    ChunkManifest,
    EncryptedChunk,
    EnvelopeCipher,
)
from app.services.audit import AuditService
from app.services.readiness import AnalysisReadinessService, RealAnalysisNotReadyError


class InvalidVideoError(ValueError):
    pass


class VideoTooLargeError(ValueError):
    pass


class RealDataBlockedError(PermissionError):
    pass


class ConsentRequiredError(ValueError):
    pass


def _normalize_consent_reference(value: str | None) -> str | None:
    if value is None:
        return None
    return unicodedata.normalize("NFKC", value).strip()


def detect_video_media_type(head: bytes) -> str:
    if len(head) >= 12 and head[4:8] == b"ftyp":
        return "video/mp4"
    if head.startswith(b"\x1aE\xdf\xa3"):
        return "video/webm"
    raise InvalidVideoError("unsupported or corrupt video signature")


class VideoService:
    def __init__(
        self,
        *,
        settings: Settings,
        chunk_cipher: ChunkCipher,
        envelope_cipher: EnvelopeCipher,
        audit: AuditService,
        readiness: AnalysisReadinessService | None = None,
    ) -> None:
        self.settings = settings
        self.chunk_cipher = chunk_cipher
        self.envelope_cipher = envelope_cipher
        self.audit = audit
        self.readiness = readiness or AnalysisReadinessService(
            settings=settings,
            beto_available=False,
        )
        self.video_root = settings.storage_dir / "videos"

    def _validate_data_gate(
        self,
        data_kind: DataKind,
        *,
        explicit_consent: bool,
        consent_reference: str | None,
    ) -> None:
        if data_kind is not DataKind.REAL:
            return
        if not explicit_consent or not _normalize_consent_reference(consent_reference):
            raise ConsentRequiredError(
                "Cada testimonio real requiere consentimiento explícito y referencia"
            )
        try:
            self.readiness.require_real_ready()
        except RealAnalysisNotReadyError as exc:
            raise RealDataBlockedError(str(exc)) from exc

    def _encrypt_consent(
        self,
        session: Session,
        user: User,
        consent_reference: str,
    ) -> Consent:
        consent_id = str(uuid4())
        granted_at = datetime.now(timezone.utc)
        payload = self.envelope_cipher.encrypt_json(
            consent_id,
            "consent",
            {
                "explicit": True,
                "reference": consent_reference,
                "institutional_authorization_id": (
                    self.settings.institutional_authorization_id
                ),
                "granted_at": granted_at.isoformat(),
            },
        )
        consent = Consent(
            id=consent_id,
            user_id=user.id,
            consent_type="video_analysis",
            granted_at=granted_at,
            key_version=payload.key_version,
            nonce=payload.nonce,
            ciphertext=payload.ciphertext,
        )
        session.add(consent)
        return consent

    def create(
        self,
        session: Session,
        *,
        user: User,
        source: BinaryIO,
        data_kind: DataKind,
        explicit_consent: bool = False,
        consent_reference: str | None = None,
        is_demo: bool = False,
        now: datetime | None = None,
    ) -> Video:
        normalized_consent_reference = _normalize_consent_reference(consent_reference)
        reference_now = now or datetime.now(timezone.utc)
        self._validate_data_gate(
            data_kind,
            explicit_consent=explicit_consent,
            consent_reference=normalized_consent_reference,
        )
        source.seek(0)
        head = source.read(32)
        media_type = detect_video_media_type(head)
        source.seek(0)

        video_id = str(uuid4())
        target_dir = self.video_root / video_id
        try:
            manifest = self.chunk_cipher.encrypt_stream(
                video_id,
                source,
                target_dir,
                chunk_size=self.settings.video_chunk_bytes,
                max_bytes=self.settings.max_video_bytes,
            )
        except ValueError as exc:
            if "size limit" in str(exc):
                raise VideoTooLargeError(str(exc)) from exc
            raise
        if manifest.total_size == 0:
            raise InvalidVideoError("video is empty")

        consent: Consent | None = None
        if data_kind is DataKind.REAL and normalized_consent_reference:
            consent = self._encrypt_consent(session, user, normalized_consent_reference)

        suffix = ".webm" if media_type == "video/webm" else ".mp4"
        video = Video(
            id=video_id,
            owner_id=user.id,
            consent_id=consent.id if consent else None,
            filename=f"testimonio{suffix}",
            media_type=media_type,
            size_bytes=manifest.total_size,
            chunk_size=manifest.chunk_size,
            key_version=self.chunk_cipher.current_version,
            data_kind=data_kind.value,
            status="uploaded",
            is_demo=is_demo,
            delete_after=(
                reference_now + timedelta(days=self.settings.video_retention_days)
                if data_kind is DataKind.REAL
                else None
            ),
        )
        session.add(video)
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
        session.add(
            self.audit.build_record(
                actor_id=user.id,
                actor_role=user.role,
                action="video_uploaded",
                entity_type="video",
                entity_id=video.id,
                details={
                    "data_kind": data_kind.value,
                    "is_demo": is_demo,
                    "consent_id": consent.id if consent else None,
                },
            )
        )
        session.flush()
        return video

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
                data_kind=DataKind.FICTITIOUS,
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

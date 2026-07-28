from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class EncryptedPayloadMixin:
    key_version: Mapped[int] = mapped_column(Integer, nullable=False)
    nonce: Mapped[bytes] = mapped_column(LargeBinary(12), nullable=False)
    ciphertext: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)

    def encrypted_payload(self) -> Any:
        from app.security.crypto import EncryptedPayload

        return EncryptedPayload(
            key_version=self.key_version,
            nonce=self.nonce,
            ciphertext=self.ciphertext,
        )

    def set_encrypted_payload(self, payload: Any) -> None:
        self.key_version = payload.key_version
        self.nonce = payload.nonce
        self.ciphertext = payload.ciphertext


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    role: Mapped[str] = mapped_column(String(24), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    sessions: Mapped[list["RefreshSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class RefreshSession(Base):
    __tablename__ = "refresh_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_jti_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rotated_from_id: Mapped[str | None] = mapped_column(String(36))

    user: Mapped[User] = relationship(back_populates="sessions")


class Consent(EncryptedPayloadMixin, TimestampMixin, Base):
    __tablename__ = "consents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    consent_type: Mapped[str] = mapped_column(String(32), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Video(TimestampMixin, Base):
    __tablename__ = "videos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    consent_id: Mapped[str | None] = mapped_column(ForeignKey("consents.id"))
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    media_type: Mapped[str] = mapped_column(String(80), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_size: Mapped[int] = mapped_column(Integer, nullable=False)
    key_version: Mapped[int] = mapped_column(Integer, nullable=False)
    data_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="uploaded", nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    delete_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    chunks: Mapped[list["VideoChunk"]] = relationship(
        back_populates="video",
        cascade="all, delete-orphan",
        order_by="VideoChunk.chunk_index",
    )


class VideoChunk(Base):
    __tablename__ = "video_chunks"
    __table_args__ = (UniqueConstraint("video_id", "chunk_index"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    video_id: Mapped[str] = mapped_column(
        ForeignKey("videos.id", ondelete="CASCADE"), index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    byte_start: Mapped[int] = mapped_column(Integer, nullable=False)
    byte_end: Mapped[int] = mapped_column(Integer, nullable=False)
    key_version: Mapped[int] = mapped_column(Integer, nullable=False)
    nonce: Mapped[bytes] = mapped_column(LargeBinary(12), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    ciphertext_size: Mapped[int] = mapped_column(Integer, nullable=False)

    video: Mapped[Video] = relationship(back_populates="chunks")


class Analysis(TimestampMixin, Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    video_id: Mapped[str] = mapped_column(ForeignKey("videos.id"), index=True)
    requested_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(24), default="queued", nullable=False)
    current_stage: Mapped[str | None] = mapped_column(String(32))
    failure_code: Mapped[str | None] = mapped_column(String(64))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AnalysisEvent(EncryptedPayloadMixin, Base):
    __tablename__ = "analysis_events"
    __table_args__ = (
        UniqueConstraint("analysis_id", "sequence"),
        Index("ix_analysis_events_replay", "analysis_id", "sequence"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    analysis_id: Mapped[str] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    stage: Mapped[str] = mapped_column(String(32), nullable=False)
    state: Mapped[str] = mapped_column(String(24), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class CaseRecord(TimestampMixin, Base):
    __tablename__ = "cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    analysis_id: Mapped[str] = mapped_column(
        ForeignKey("analyses.id", ondelete="CASCADE"), unique=True
    )
    video_id: Mapped[str] = mapped_column(ForeignKey("videos.id"), index=True)
    status: Mapped[str] = mapped_column(String(24), default="in_review", nullable=False)
    recommendation_status: Mapped[str] = mapped_column(
        String(24), default="preliminary", nullable=False
    )
    approved_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Fact(EncryptedPayloadMixin, TimestampMixin, Base):
    __tablename__ = "facts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    case_id: Mapped[str] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), index=True
    )
    fact_type: Mapped[str] = mapped_column(String(40), nullable=False)
    origin: Mapped[str] = mapped_column(String(20), nullable=False)
    verification_status: Mapped[str] = mapped_column(String(24), nullable=False)
    confidence_band: Mapped[str] = mapped_column(String(16), nullable=False)
    is_critical: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Route(EncryptedPayloadMixin, TimestampMixin, Base):
    __tablename__ = "routes"
    __table_args__ = (UniqueConstraint("case_id", "route_type"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    case_id: Mapped[str] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), index=True
    )
    route_type: Mapped[str] = mapped_column(String(32), nullable=False)
    verification_status: Mapped[str] = mapped_column(String(24), nullable=False)
    confidence_band: Mapped[str] = mapped_column(String(16), nullable=False)


class SourceEntry(TimestampMixin, Base):
    __tablename__ = "source_entries"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    entity: Mapped[str] = mapped_column(String(180), nullable=False)
    program: Mapped[str] = mapped_column(String(255), nullable=False)
    coverage: Mapped[str] = mapped_column(String(180), nullable=False)
    requirements: Mapped[str] = mapped_column(Text, nullable=False)
    contact: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source_kind: Mapped[str] = mapped_column(String(24), nullable=False)
    route_types: Mapped[str] = mapped_column(String(180), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="active", nullable=False)


class Review(EncryptedPayloadMixin, Base):
    __tablename__ = "reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    case_id: Mapped[str] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), index=True
    )
    fact_id: Mapped[str | None] = mapped_column(ForeignKey("facts.id", ondelete="CASCADE"))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(24), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class AuditLog(EncryptedPayloadMixin, Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    actor_role: Mapped[str] = mapped_column(String(24), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), index=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class Tombstone(Base):
    __tablename__ = "tombstones"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    case_id_hash: Mapped[str] = mapped_column(String(64), unique=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(24), nullable=False)


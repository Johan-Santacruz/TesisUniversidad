from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.ai.contracts import (
    AnalysisStage,
    ConfidenceBand,
    EvidenceRef,
    Origin,
    ProviderRouteStep,
    RouteApplicability,
    RouteType,
    ScalarValue,
    TranscriptSegment,
    VerificationStatus,
)


class UserRole(StrEnum):
    OPERATOR = "operador"
    VALIDATOR = "validador"
    ADMIN = "admin"


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    role: UserRole
    is_active: bool


class UserList(BaseModel):
    items: list[UserRead]


class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=12, max_length=256)
    role: UserRole

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized.count("@") != 1:
            raise ValueError("email must contain one @")
        local, domain = normalized.split("@", 1)
        if not local or not domain:
            raise ValueError("email must contain local and domain parts")
        return normalized


class UserUpdate(BaseModel):
    password: str | None = Field(default=None, min_length=12, max_length=256)
    role: UserRole | None = None
    is_active: bool | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead


class VideoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    media_type: str
    size_bytes: int
    status: str
    is_demo: bool
    created_at: datetime


class AnalysisRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    video_id: str
    status: str
    current_stage: AnalysisStage | None
    events_url: str


class VideoLinkCreate(BaseModel):
    """El enlace tal como lo pegó quien analiza; se normaliza en el servicio."""

    url: str = Field(min_length=1, max_length=2048)


class AnalysisReadinessRead(BaseModel):
    can_upload: bool
    # Si la interfaz debe ofrecer el campo de enlace. Va aquí y no en una ruta
    # aparte porque es una capacidad del servidor, como ffmpeg o BETO: la
    # pantalla de ingesta ya pregunta por todas de una vez.
    link_ingest_enabled: bool = False
    link_ingest_max_seconds: int = 1800
    openai_configured: bool
    anthropic_configured: bool
    beto_available: bool
    ffmpeg_available: bool
    ffprobe_available: bool
    accepted_media_types: list[Literal["video/mp4", "video/webm"]]
    max_video_bytes: int
    video_retention_days: int


class FactRead(BaseModel):
    id: str
    # La clave técnica ('vulnerabilities'): el rótulo cambia de un caso a otro,
    # así que es lo único con lo que la pantalla puede reconocer una señal.
    key: str | None = None
    label: str
    value: ScalarValue
    # El dato canónico sirve para contrastar proveedores y queda en inglés
    # ("widowed"). Quien lee la ficha necesita el texto que el modelo ya
    # escribió en español ("Viuda"); sin este campo nunca salía de la base.
    display_value: str | None = None
    origin: Origin
    verification_status: VerificationStatus
    confidence_band: ConfidenceBand
    is_critical: bool
    evidence: list[EvidenceRef] = Field(default_factory=list)
    provider_values: dict[str, ScalarValue] = Field(default_factory=dict)


class FactReviewRequest(BaseModel):
    action: Literal["confirm", "correct"]
    value: ScalarValue = None
    # Ni confirmar ni corregir piden justificación: obligarla sólo añadía
    # fricción y motivos de relleno. La auditoría ya guarda quién revisó, el
    # valor anterior, el nuevo y el estado resultante.
    reason: str = Field(default="", max_length=1000)


class RouteRead(BaseModel):
    id: str
    route_type: RouteType
    # Las tres rutas se evalúan siempre, pero no siempre aplican las tres. Sin
    # este campo el modelo se veía obligado a escribirlas como si aplicaran y se
    # cubría con condicionales dentro del texto.
    applicability: RouteApplicability = RouteApplicability.APPLIES
    title: str
    summary: str
    steps: list[ProviderRouteStep]
    origin: Origin = Origin.INFERRED
    verification_status: VerificationStatus
    confidence_band: ConfidenceBand
    provider_options: dict[str, Any] | None = None


class TimelineEventRead(BaseModel):
    id: str
    title: str
    description: str
    start_ms: int
    end_ms: int
    origin: Origin
    verification_status: VerificationStatus
    confidence_band: ConfidenceBand
    provider_options: dict[str, Any] | None = None


class SourceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    entity: str
    program: str
    coverage: str
    requirements: str
    contact: str
    url: str
    verified_at: datetime
    expires_at: datetime
    source_kind: Literal["contact", "program"]
    route_types: list[RouteType]
    status: str
    is_expired: bool
    disclaimer: str | None


class SourceList(BaseModel):
    items: list[SourceRead]


class SourceCreate(BaseModel):
    id: str = Field(min_length=3, max_length=64)
    entity: str = Field(min_length=2, max_length=180)
    program: str = Field(min_length=2, max_length=255)
    coverage: str = Field(min_length=2, max_length=180)
    requirements: str = Field(min_length=2)
    contact: str = Field(min_length=2)
    url: str = Field(pattern=r"^https://")
    verified_at: datetime
    expires_at: datetime
    source_kind: Literal["contact", "program"]
    route_types: list[RouteType] = Field(min_length=1)
    status: str = "active"


class SourceUpdate(BaseModel):
    entity: str | None = Field(default=None, min_length=2, max_length=180)
    program: str | None = Field(default=None, min_length=2, max_length=255)
    coverage: str | None = Field(default=None, min_length=2, max_length=180)
    requirements: str | None = Field(default=None, min_length=2)
    contact: str | None = Field(default=None, min_length=2)
    url: str | None = Field(default=None, pattern=r"^https://")
    verified_at: datetime | None = None
    expires_at: datetime | None = None
    source_kind: Literal["contact", "program"] | None = None
    route_types: list[RouteType] | None = Field(default=None, min_length=1)
    status: str | None = None


class MemoryImageRead(BaseModel):
    id: str
    generation: int
    status: Literal[
        "generating", "pending_review", "approved", "rejected", "failed"
    ]
    image_url: str | None
    rendered_video_url: str | None
    render_status: Literal["rendering", "ready", "failed", "expired"] | None
    failure_code: str | None
    reviewed_at: datetime | None


class MemoryImageDecisionRequest(BaseModel):
    action: Literal["approve", "reject"]


class MemoryImageDecisionRead(BaseModel):
    memory_image: MemoryImageRead


class CaseRead(BaseModel):
    id: str
    analysis_id: str
    video_id: str
    status: str
    recommendation_status: str
    approved_at: datetime | None
    video_stream_url: str
    segments: list[TranscriptSegment]
    timeline: list[TimelineEventRead]
    facts: list[FactRead]
    classification: dict[str, Any]
    sources: list[SourceRead]
    routes: list[RouteRead]
    critical_inconsistencies: int
    memory_image: MemoryImageRead | None = None


class CaseApprovalRequest(BaseModel):
    confirmed_route_types: list[RouteType]


class CaseApprovalRead(BaseModel):
    id: str
    status: str
    recommendation_status: str
    approved_at: datetime
    video_delete_after: datetime
    video_retention_days: int


class TombstoneRead(BaseModel):
    case_id_hash: str
    deleted_at: datetime
    action: str
    actor_role: str

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


class Message(BaseModel):
    message: str


class DataKind(StrEnum):
    FICTITIOUS = "fictitious"
    REAL = "real"


class VideoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    media_type: str
    size_bytes: int
    data_kind: DataKind
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


class FactRead(BaseModel):
    id: str
    label: str
    value: ScalarValue
    origin: Origin
    verification_status: VerificationStatus
    confidence_band: ConfidenceBand
    is_critical: bool
    evidence: list[EvidenceRef] = Field(default_factory=list)
    provider_values: dict[str, ScalarValue] = Field(default_factory=dict)


class FactReviewRequest(BaseModel):
    action: Literal["confirm", "correct"]
    value: ScalarValue = None
    reason: str = Field(min_length=5, max_length=1000)


class RouteRead(BaseModel):
    id: str
    route_type: RouteType
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

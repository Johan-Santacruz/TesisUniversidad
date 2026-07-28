from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Origin(StrEnum):
    MENTIONED = "mentioned"
    INFERRED = "inferred"
    CONTRASTED = "contrasted"


class VerificationStatus(StrEnum):
    CONFIRMED = "confirmed"
    PENDING = "pending"
    NOT_IDENTIFIED = "not_identified"
    INCONSISTENT = "inconsistent"


class ConfidenceBand(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class RouteType(StrEnum):
    EMERGENCY = "emergency"
    HOUSING_STABILIZATION = "housing_stabilization"
    RETURN_RELOCATION = "return_relocation"


class AnalysisStage(StrEnum):
    AUDIO = "audio"
    TRANSCRIPTION = "transcription"
    PEOPLE_PLACES = "people_places"
    DATES_FACTS = "dates_facts"
    CLASSIFICATION = "classification"
    SOURCES = "sources"
    TIMELINE = "timeline"
    ROUTES = "routes"


ScalarValue = str | int | float | bool | list[str] | None


class EvidenceRef(StrictModel):
    segment_id: str = Field(min_length=1)
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)

    @model_validator(mode="after")
    def end_must_follow_start(self) -> "EvidenceRef":
        if self.end_ms < self.start_ms:
            raise ValueError("evidence end_ms must follow start_ms")
        return self


class TranscriptSegment(StrictModel):
    id: str
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    text: str


class TranscriptResult(StrictModel):
    text: str
    segments: list[TranscriptSegment]


class ProviderSignal(StrictModel):
    key: str
    value: ScalarValue
    origin: Origin
    evidence: list[EvidenceRef]


class ProviderTimelineEvent(StrictModel):
    id: str
    title: str
    description: str
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    evidence: list[EvidenceRef]


class GroundedClaim(StrictModel):
    text: str
    source_entry_id: str


class ProviderRouteStep(StrictModel):
    title: str
    instructions: str
    claims: list[GroundedClaim]


class ProviderRoute(StrictModel):
    route_type: RouteType
    summary: str
    steps: list[ProviderRouteStep]


class ProviderAnalysis(StrictModel):
    provider: Literal["gpt", "claude"]
    signals: list[ProviderSignal]
    timeline: list[ProviderTimelineEvent]
    routes: list[ProviderRoute]


class ReconciledSignal(StrictModel):
    key: str
    value: ScalarValue
    origin: Origin
    verification_status: VerificationStatus
    confidence_band: ConfidenceBand
    evidence: list[EvidenceRef]
    provider_values: dict[str, ScalarValue]
    invalid_evidence_providers: list[str] = []


class LabelProbability(StrictModel):
    label: str
    confidence: float = Field(ge=0, le=1)


class BetoClassification(StrictModel):
    status: Literal["available", "unavailable"]
    category: LabelProbability | None = None
    subcategory: LabelProbability | None = None
    unavailable_reason: str | None = None


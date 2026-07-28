from __future__ import annotations

import json

from app.ai.contracts import (
    BetoClassification,
    EvidenceRef,
    GroundedClaim,
    LabelProbability,
    Origin,
    ProviderAnalysis,
    ProviderRoute,
    ProviderRouteStep,
    ProviderSignal,
    ProviderTimelineEvent,
    RouteType,
    TranscriptResult,
    TranscriptSegment,
)
from app.services.analysis import AnalysisService


class FakeWhisper:
    def transcribe(self, audio: bytes, *, filename: str) -> TranscriptResult:
        assert audio == b"audio-en-memoria"
        assert filename.endswith(".mp3")
        return TranscriptResult(
            text="Testimonio enteramente ficticio sobre una llegada a Popayán.",
            segments=[
                TranscriptSegment(
                    id="segment-1",
                    start_ms=0,
                    end_ms=8000,
                    text="Una familia ficticia llegó a Popayán.",
                ),
                TranscriptSegment(
                    id="segment-2",
                    start_ms=8000,
                    end_ms=16000,
                    text="Necesita orientación temporal.",
                ),
            ],
        )


class FakeBeto:
    def classify(self, text: str) -> BetoClassification:
        assert "ficticio" in text
        return BetoClassification(
            status="available",
            category=LabelProbability(
                label="Desplazamiento",
                confidence=0.92,
            ),
            subcategory=LabelProbability(
                label="Desplazamiento forzado",
                confidence=0.88,
            ),
        )


def _provider(provider: str, urgency: str = "high") -> ProviderAnalysis:
    evidence = [
        EvidenceRef(segment_id="segment-1", start_ms=0, end_ms=8000)
    ]
    routes = [
        ProviderRoute(
            route_type=RouteType.EMERGENCY,
            summary="Orientación inmediata.",
            steps=[
                ProviderRouteStep(
                    title="Consultar CRAV",
                    instructions="Confirmar el canal vigente.",
                    claims=[
                        GroundedClaim(
                            text="Existe un directorio oficial de atención.",
                            source_entry_id="uariv-crav-popayan",
                        )
                    ],
                )
            ],
        ),
        ProviderRoute(
            route_type=RouteType.HOUSING_STABILIZATION,
            summary="Revisar oferta institucional.",
            steps=[
                ProviderRouteStep(
                    title="Consultar servicios",
                    instructions="Verificar requisitos vigentes.",
                    claims=[
                        GroundedClaim(
                            text="La guía oficial presenta trámites y servicios.",
                            source_entry_id="uariv-services-national",
                        )
                    ],
                )
            ],
        ),
        ProviderRoute(
            route_type=RouteType.RETURN_RELOCATION,
            summary="Evaluar retorno o reubicación acompañada.",
            steps=[
                ProviderRouteStep(
                    title="Solicitar evaluación",
                    instructions="Verificar voluntariedad y condiciones.",
                    claims=[
                        GroundedClaim(
                            text="Existe una ruta oficial de retornos y reubicaciones.",
                            source_entry_id="uariv-return-relocation",
                        )
                    ],
                )
            ],
        ),
    ]
    return ProviderAnalysis(
        provider=provider,
        signals=[
            ProviderSignal(
                key="people",
                value="Familia ficticia",
                origin=Origin.MENTIONED,
                evidence=evidence,
            ),
            ProviderSignal(
                key="current_location",
                value="Popayán, Cauca",
                origin=Origin.MENTIONED,
                evidence=evidence,
            ),
            ProviderSignal(
                key="urgency",
                value=urgency,
                origin=Origin.INFERRED,
                evidence=evidence,
            ),
        ],
        timeline=[
            ProviderTimelineEvent(
                id="arrival",
                title="Llegada a Popayán",
                description="La familia ficticia identifica su ubicación actual.",
                start_ms=0,
                end_ms=8000,
                evidence=evidence,
            )
        ],
        routes=routes,
    )


class FakeReader:
    def __init__(self, value: ProviderAnalysis | Exception):
        self.value = value

    def analyze(self, segments):
        if isinstance(self.value, Exception):
            raise self.value
        return self.value


def _configured_service(operator_client, *, claude_value):
    app = operator_client.app
    return AnalysisService(
        database=app.state.database,
        cipher=app.state.cipher,
        rag=app.state.rag,
        beto=FakeBeto(),
        video_service=app.state.videos,
        whisper=FakeWhisper(),
        gpt=FakeReader(_provider("gpt")),
        claude=FakeReader(claude_value),
        audio_extractor=lambda _: b"audio-en-memoria",
        retry_attempts=0,
    )


def _run_uploaded(operator_client, tiny_video_bytes, *, claude_value):
    operator_client.app.state.analysis = _configured_service(
        operator_client,
        claude_value=claude_value,
    )
    video = operator_client.post(
        "/api/v1/videos",
        files={"file": ("ficticio.mp4", tiny_video_bytes, "video/mp4")},
        data={"data_kind": "fictitious"},
    ).json()
    analysis = operator_client.post(
        f"/api/v1/videos/{video['id']}/analyses"
    ).json()
    stream = operator_client.get(analysis["events_url"]).text
    payloads = [
        json.loads(line.removeprefix("data: "))
        for line in stream.splitlines()
        if line.startswith("data: ")
    ]
    return analysis, payloads


def test_configured_pipeline_runs_all_models_and_grounds_three_routes(
    operator_client, tiny_video_bytes
):
    _, payloads = _run_uploaded(
        operator_client,
        tiny_video_bytes,
        claude_value=_provider("claude"),
    )

    assert [item["stage"] for item in payloads] == [
        "audio",
        "transcription",
        "people_places",
        "dates_facts",
        "classification",
        "sources",
        "timeline",
        "routes",
    ]
    urgency = next(
        fact
        for fact in payloads[3]["payload"]["facts"]
        if fact["key"] == "urgency"
    )
    assert urgency["verification_status"] == "confirmed"
    assert urgency["confidence_band"] == "high"
    classification = payloads[4]["payload"]["classification"]
    assert set(classification) == {
        "status",
        "category",
        "subcategory",
        "unavailable_reason",
    }
    routes = payloads[7]["payload"]["routes"]
    assert {route["route_type"] for route in routes} == {
        "emergency",
        "housing_stabilization",
        "return_relocation",
    }
    assert all(route["verification_status"] == "confirmed" for route in routes)


def test_provider_disagreement_stays_visible_instead_of_choosing_gpt(
    operator_client, tiny_video_bytes
):
    _, payloads = _run_uploaded(
        operator_client,
        tiny_video_bytes,
        claude_value=_provider("claude", urgency="medium"),
    )

    urgency = next(
        fact
        for fact in payloads[3]["payload"]["facts"]
        if fact["key"] == "urgency"
    )
    assert urgency["verification_status"] == "inconsistent"
    assert urgency["value"] is None
    assert urgency["provider_values"] == {"gpt": "high", "claude": "medium"}


def test_one_provider_timeout_produces_partial_pending_results(
    operator_client, tiny_video_bytes
):
    analysis, payloads = _run_uploaded(
        operator_client,
        tiny_video_bytes,
        claude_value=TimeoutError("simulated timeout"),
    )

    urgency = next(
        fact
        for fact in payloads[3]["payload"]["facts"]
        if fact["key"] == "urgency"
    )
    assert urgency["verification_status"] == "pending"
    assert urgency["confidence_band"] == "medium"
    assert payloads[7]["payload"]["recommendation_status"] == "preliminary"

    database = operator_client.app.state.database
    from app.models import Analysis

    with database.session() as session:
        assert session.get(Analysis, analysis["id"]).status == "partial"

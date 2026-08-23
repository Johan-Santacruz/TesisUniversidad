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
)
from app.ai.providers import RawTranscriptChunk, RawTranscriptSegment
from app.services.analysis import AnalysisService
from app.services.media import AudioChunk
from app.services.transcription import TranscriptionService


class FakeMedia:
    """Entrega un bloque de audio ya decodificado, como haría ffmpeg."""

    def iter_audio_chunks(self, video: object):
        yield AudioChunk(
            index=0,
            start_ms=0,
            end_ms=16000,
            wav_bytes=b"audio-en-memoria",
        )


class FakeWhisper:
    """Doble al nivel del adaptador real: transcribe un bloque a la vez."""

    def transcribe_chunk(self, audio: bytes, *, filename: str) -> RawTranscriptChunk:
        assert audio == b"audio-en-memoria"
        assert filename.endswith(".wav")
        return RawTranscriptChunk(
            text="Testimonio enteramente ficticio sobre una llegada a Popayán.",
            segments=(
                RawTranscriptSegment(
                    start_ms=0,
                    end_ms=8000,
                    text="Una familia ficticia llegó a Popayán.",
                ),
                RawTranscriptSegment(
                    start_ms=8000,
                    end_ms=16000,
                    text="Necesita orientación temporal.",
                ),
            ),
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
        EvidenceRef(segment_id="segment-0000-0000", start_ms=0, end_ms=8000)
    ]
    routes = [
        ProviderRoute(
            route_type=RouteType.EMERGENCY,
            summary="Orientación inmediata.",
            steps=[
                ProviderRouteStep(
                    title="Consultar CRAV",
                    key_point="Lleve lo que conserve.",
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
                    key_point="Lleve lo que conserve.",
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
                    key_point="Lleve lo que conserve.",
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
                label="People",
                display_value="",
                value="Familia ficticia",
                origin=Origin.MENTIONED,
                evidence=evidence,
            ),
            ProviderSignal(
                key="current_location",
                label="Current location",
                display_value="",
                value="Popayán, Cauca",
                origin=Origin.MENTIONED,
                evidence=evidence,
            ),
            ProviderSignal(
                key="urgency",
                label="Urgencia",
                display_value="Alta",
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

    def analyze(self, segments, sources=None, classification=None):
        if isinstance(self.value, Exception):
            raise self.value
        # El catálogo debe llegar al proveedor: sin él no podría citar fuentes.
        assert sources is not None
        # Y la clasificación también: es lo que permite que las rutas
        # respondan al tipo de desplazamiento en vez de ser plantillas.
        self.seen_classification = classification
        return self.value


def _configured_service(operator_client, *, claude_value):
    app = operator_client.app
    return AnalysisService(
        database=app.state.database,
        cipher=app.state.cipher,
        rag=app.state.rag,
        beto=FakeBeto(),
        video_service=app.state.videos,
        media=FakeMedia(),
        # El doble se queda al nivel del adaptador real (un bloque a la vez) y
        # el servicio de transcripción es el de producción: así la prueba
        # recorre la misma costura que la app.
        transcription=TranscriptionService(FakeWhisper()),
        gpt=FakeReader(_provider("gpt")),
        claude=FakeReader(claude_value),
        memory_images=app.state.memory_images,
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



def test_routes_are_built_knowing_the_kind_of_displacement(
    operator_client, tiny_video_bytes
):
    """La clasificación se calculaba después de llamar a los proveedores, así
    que las rutas nacían sin saber de qué desplazamiento se trataba y salían
    intercambiables entre casos. Ahora viaja en el input del análisis."""
    service = _configured_service(operator_client, claude_value=_provider("claude"))
    operator_client.app.state.analysis = service
    video = operator_client.post(
        "/api/v1/videos",
        files={"file": ("ficticio.mp4", tiny_video_bytes, "video/mp4")},
    ).json()
    analysis = operator_client.post(
        f"/api/v1/videos/{video['id']}/analyses"
    ).json()
    operator_client.get(analysis["events_url"])

    for reader in (service.gpt, service.claude):
        assert reader.seen_classification is not None, (
            "el proveedor construyó las rutas sin la clasificación"
        )
        assert "category" in reader.seen_classification

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


def test_configured_pipeline_case_is_readable_through_public_workspace_contract(
    operator_client, tiny_video_bytes
):
    _, payloads = _run_uploaded(
        operator_client,
        tiny_video_bytes,
        claude_value=_provider("claude"),
    )
    case_id = payloads[7]["payload"]["case_id"]

    response = operator_client.get(f"/api/v1/cases/{case_id}")

    assert response.status_code == 200
    workspace = response.json()
    assert workspace["segments"][0]["id"] == "segment-0000-0000"
    labels = {fact["label"] for fact in workspace["facts"]}
    assert "Urgencia" in labels, labels
    assert len(workspace["routes"]) == 3


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
    from app.entities import Analysis

    with database.session() as session:
        assert session.get(Analysis, analysis["id"]).status == "partial"


def test_demo_pipeline_generates_a_pending_memory_image_without_provider(operator_client):
    video = operator_client.post("/api/v1/videos/demo").json()
    analysis = operator_client.post(f"/api/v1/videos/{video['id']}/analyses").json()
    stream = operator_client.get(analysis["events_url"]).text
    routes = next(
        json.loads(line.removeprefix("data: "))["payload"]
        for line in stream.splitlines()
        if line.startswith("data: ")
        and json.loads(line.removeprefix("data: "))["stage"] == "routes"
    )
    from app.entities import MemoryImage

    with operator_client.app.state.database.session() as session:
        images = list(
            session.query(MemoryImage).filter(MemoryImage.case_id == routes["case_id"])
        )
    assert [(image.generation, image.status) for image in images] == [(1, "pending_review")]


def test_uploaded_pipeline_keeps_completion_status_when_image_provider_is_missing(
    operator_client, tiny_video_bytes
):
    analysis, payloads = _run_uploaded(
        operator_client,
        tiny_video_bytes,
        claude_value=_provider("claude"),
    )
    case_id = payloads[-1]["payload"]["case_id"]
    from app.entities import Analysis, MemoryImage

    with operator_client.app.state.database.session() as session:
        assert session.get(Analysis, analysis["id"]).status == "completed"
        [image] = list(
            session.query(MemoryImage).filter(MemoryImage.case_id == case_id)
        )
    assert (image.status, image.failure_code) == (
        "failed",
        "image_provider_not_configured",
    )

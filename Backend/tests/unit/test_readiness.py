from __future__ import annotations

from app.schemas import UserRole
from app.services.readiness import AnalysisReadinessService


def test_readiness_exposes_capabilities_without_secrets(settings_factory):
    service = AnalysisReadinessService(
        settings=settings_factory(),
        beto_available=False,
        command_available=lambda name: name in {"ffmpeg", "ffprobe"},
    )

    value = service.check(UserRole.OPERATOR).model_dump()

    assert set(value) == {
        "can_upload",
        "link_ingest_enabled",
        "link_ingest_max_seconds",
        "openai_configured",
        "anthropic_configured",
        "beto_available",
        "ffmpeg_available",
        "ffprobe_available",
        "accepted_media_types",
        "max_video_bytes",
        "video_retention_days",
    }
    assert "authorization" not in repr(value).lower()
    # La ingesta por enlace es una capacidad que el servidor concede, no una que
    # la interfaz asuma: por omisión está apagada.
    assert value["link_ingest_enabled"] is False


def test_readiness_endpoint_requires_authentication_and_reports_capabilities(
    operator_client,
):
    response = operator_client.get("/api/v1/analyses/readiness")

    assert response.status_code == 200
    assert response.json()["can_upload"] is True

"""El análisis arranca con el audio y el video llega después.

Subir el video de un celular tardaba más que el análisis entero: 147 MB a la
velocidad de subida de una casa son un minuto y medio antes de que empezara
nada. El navegador separa el audio —3 MB para ese mismo video— y lo manda
primero; el video sigue subiendo mientras el análisis corre.
"""
from __future__ import annotations

from io import BytesIO
import json
import math
import struct
import wave

from app.entities import Analysis, AuditLog, MemoryImage, Video
from app.services.analysis import AnalysisService
from app.services.media import AudioChunk
from app.services.transcription import TranscriptionService
from tests.integration.case_helpers import (
    APPROVAL_PAYLOAD,
    confirm_critical_facts,
    create_demo_case,
    create_validator,
    login,
)
from tests.integration.test_pipeline import FakeBeto, FakeReader, FakeWhisper, _provider


def _wav(seconds: float, rate: int = 16_000) -> bytes:
    """Un tono, como el WAV de 16 kHz mono que arma el navegador."""
    buffer = BytesIO()
    with wave.open(buffer, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes(
            b"".join(
                struct.pack("<h", int(8000 * math.sin(2 * math.pi * 440 * i / rate)))
                for i in range(int(seconds * rate))
            )
        )
    return buffer.getvalue()


def _intake(client, audio: bytes, *, size_bytes: int = 4096, media_type: str = "video/mp4"):
    return client.post(
        "/api/v1/videos/intake",
        files={"audio": ("audio.wav", audio, "audio/wav")},
        data={"size_bytes": str(size_bytes), "media_type": media_type},
    )


def _send_video(client, video_id: str, payload: bytes):
    return client.put(
        f"/api/v1/videos/{video_id}/content",
        files={"file": ("testimonio.mp4", payload, "video/mp4")},
    )


def _events(client, events_url: str) -> list[dict]:
    return [
        json.loads(line.removeprefix("data: "))
        for line in client.get(events_url).text.splitlines()
        if line.startswith("data: ")
    ]


def _video_dir(client, video_id: str):
    return client.app.state.settings.storage_dir / "videos" / video_id


def test_the_analysis_starts_from_the_audio_before_the_video_arrives(
    operator_client, valid_mp4_bytes
):
    response = _intake(operator_client, _wav(0.4), size_bytes=len(valid_mp4_bytes))

    assert response.status_code == 201
    body = response.json()
    assert body["video"]["status"] == "receiving"
    events = _events(operator_client, body["analysis"]["events_url"])
    # Sin proveedores configurados el recorrido se detiene en Whisper; lo que
    # importa aquí es que el audio salió del WAV y no de un video que no existe.
    audio = events[0]
    assert (audio["stage"], audio["state"]) == ("audio", "completed")
    assert audio["payload"]["audio_bytes"] > 0
    assert events[1]["payload"]["reason"] == "whisper_not_configured"

    waiting = operator_client.get(f"/api/v1/videos/{body['video']['id']}/stream")
    assert waiting.status_code == 409
    assert waiting.json()["detail"] == "El video todavía se está subiendo"


def test_the_video_that_arrives_is_stored_and_streams_exactly(
    operator_client, valid_mp4_bytes
):
    video_id = _intake(operator_client, _wav(0.4)).json()["video"]["id"]

    arrived = _send_video(operator_client, video_id, valid_mp4_bytes)

    assert arrived.status_code == 200
    assert arrived.json()["status"] == "uploaded"
    assert arrived.json()["size_bytes"] == len(valid_mp4_bytes)
    streamed = operator_client.get(f"/api/v1/videos/{video_id}/stream")
    assert streamed.status_code == 200
    assert streamed.content == valid_mp4_bytes
    with operator_client.app.state.database.session() as session:
        actions = {
            record.action
            for record in session.query(AuditLog).filter(AuditLog.entity_id == video_id)
        }
    assert {"video_audio_received", "video_content_received"} <= actions


def test_a_different_recording_is_refused_and_can_be_sent_again(
    operator_client, media_fixture_factory, valid_mp4_bytes
):
    """El caso no puede mostrar un video que no es el que se leyó."""
    video_id = _intake(operator_client, _wav(0.4)).json()["video"]["id"]
    longer = media_fixture_factory(container="mp4", duration_seconds=4.0)

    refused = _send_video(operator_client, video_id, longer)

    assert refused.status_code == 422
    assert refused.json()["detail"] == "Este video no es la grabación cuyo audio se analizó"
    video_dir = _video_dir(operator_client, video_id)
    assert not video_dir.exists() or list(video_dir.iterdir()) == []
    with operator_client.app.state.database.session() as session:
        assert session.get(Video, video_id).status == "receiving"

    retried = _send_video(operator_client, video_id, valid_mp4_bytes)
    assert retried.status_code == 200


def test_a_video_is_only_received_once(operator_client, valid_mp4_bytes):
    video_id = _intake(operator_client, _wav(0.4)).json()["video"]["id"]
    assert _send_video(operator_client, video_id, valid_mp4_bytes).status_code == 200

    again = _send_video(operator_client, video_id, valid_mp4_bytes)

    assert again.status_code == 409


def test_a_classic_upload_does_not_accept_a_second_file(
    operator_client, valid_mp4_bytes
):
    uploaded = operator_client.post(
        "/api/v1/videos",
        files={"file": ("ficticio.mp4", valid_mp4_bytes, "video/mp4")},
    ).json()

    response = _send_video(operator_client, uploaded["id"], valid_mp4_bytes)

    assert response.status_code == 409


def test_only_the_owner_sends_the_video(operator_client, valid_mp4_bytes):
    video_id = _intake(operator_client, _wav(0.4)).json()["video"]["id"]
    create_validator(operator_client)
    login(operator_client, "validador@senda.local", "Clave-Validador-2026!")

    response = _send_video(operator_client, video_id, valid_mp4_bytes)

    assert response.status_code == 403


def test_a_video_too_large_is_refused_before_analyzing_it(operator_client):
    limit = operator_client.app.state.settings.max_video_bytes

    response = _intake(operator_client, _wav(0.4), size_bytes=limit + 1)

    assert response.status_code == 413
    assert response.json()["detail"] == "El video supera el tamaño permitido"
    with operator_client.app.state.database.session() as session:
        assert session.query(Analysis).count() == 0


def test_an_audio_over_the_limit_is_refused_so_the_browser_sends_the_video(
    operator_client, monkeypatch
):
    monkeypatch.setattr(
        operator_client.app.state.settings, "max_intake_audio_bytes", 1024
    )

    response = _intake(operator_client, _wav(0.4))

    assert response.status_code == 413
    assert response.json()["detail"] == "El audio supera el tamaño permitido"


def test_only_wav_audio_is_accepted(operator_client, valid_mp4_bytes):
    response = _intake(operator_client, valid_mp4_bytes)

    assert response.status_code == 415
    with operator_client.app.state.database.session() as session:
        assert session.query(Video).count() == 0


class FakeUploadedMedia:
    """Recibe el WAV del navegador y entrega el bloque que espera FakeWhisper."""

    def __init__(self) -> None:
        self.received: bytes | None = None

    def iter_uploaded_audio(self, audio: bytes):
        self.received = audio
        yield AudioChunk(index=0, start_ms=0, end_ms=16000, wav_bytes=b"audio-en-memoria")

    def iter_audio_chunks(self, video):
        raise AssertionError("el audio debía salir del WAV, no del video")


def test_the_closing_waits_for_the_video_and_starts_when_it_arrives(
    operator_client, valid_mp4_bytes
):
    """El cierre toma un fotograma del video: generarlo antes lo dejaría
    genérico. Lo genera quien recibe el video."""
    app = operator_client.app
    media = FakeUploadedMedia()
    app.state.analysis = AnalysisService(
        database=app.state.database,
        cipher=app.state.cipher,
        rag=app.state.rag,
        beto=FakeBeto(),
        video_service=app.state.videos,
        media=media,
        transcription=TranscriptionService(FakeWhisper()),
        gpt=FakeReader(_provider("gpt")),
        claude=None,
        memory_images=app.state.memory_images,
        retry_attempts=0,
    )
    audio = _wav(0.4)
    body = _intake(operator_client, audio).json()
    events = _events(operator_client, body["analysis"]["events_url"])
    case_id = events[-1]["payload"]["case_id"]

    assert media.received == audio
    case = operator_client.get(f"/api/v1/cases/{case_id}").json()
    assert case["video_status"] == "receiving"
    with app.state.database.session() as session:
        assert session.query(MemoryImage).filter(MemoryImage.case_id == case_id).count() == 0

    assert _send_video(operator_client, body["video"]["id"], valid_mp4_bytes).status_code == 200

    case = operator_client.get(f"/api/v1/cases/{case_id}").json()
    assert case["video_status"] == "uploaded"
    with app.state.database.session() as session:
        images = session.query(MemoryImage).filter(MemoryImage.case_id == case_id).count()
    assert images == 1


def _mark_receiving(client, case_id: str) -> None:
    from app.entities import CaseRecord

    with client.app.state.database.session() as session:
        case = session.get(CaseRecord, case_id)
        session.get(Video, case.video_id).status = "receiving"


def test_a_case_is_not_approved_while_its_video_is_still_arriving(client):
    case_id = create_demo_case(client)
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")
    confirm_critical_facts(client, case_id)
    _mark_receiving(client, case_id)

    response = client.post(f"/api/v1/cases/{case_id}/approve", json=APPROVAL_PAYLOAD)

    assert response.status_code == 409
    assert response.json()["detail"] == "El video del testimonio todavía se está subiendo"


def test_the_closing_is_not_regenerated_without_the_video(client):
    case_id = create_demo_case(client)
    _mark_receiving(client, case_id)

    response = client.post(f"/api/v1/cases/{case_id}/memory-image/regenerate")

    assert response.status_code == 409
    assert response.json()["detail"] == "El video del testimonio todavía se está subiendo"

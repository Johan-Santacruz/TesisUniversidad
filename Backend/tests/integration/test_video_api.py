from __future__ import annotations

import subprocess

from app.services.media import MediaToolUnavailableError


def _upload_fictitious(operator_client, payload: bytes):
    return operator_client.post(
        "/api/v1/videos",
        files={"file": ("ficticio.mp4", payload, "video/mp4")},
    )


def test_fictitious_video_uploads_and_streams_exact_ranges(
    operator_client, tiny_video_bytes
):
    uploaded = _upload_fictitious(operator_client, tiny_video_bytes)
    assert uploaded.status_code == 201
    video_id = uploaded.json()["id"]

    ranged = operator_client.get(
        f"/api/v1/videos/{video_id}/stream",
        headers={"Range": "bytes=900-2300"},
    )

    assert ranged.status_code == 206
    assert ranged.content == tiny_video_bytes[900:2301]
    assert ranged.headers["content-range"] == (
        f"bytes 900-2300/{len(tiny_video_bytes)}"
    )
    assert ranged.headers["accept-ranges"] == "bytes"
    assert ranged.headers["content-length"] == str(1401)


def test_full_stream_reconstructs_the_original_video(
    operator_client, tiny_video_bytes
):
    uploaded = _upload_fictitious(operator_client, tiny_video_bytes)
    video_id = uploaded.json()["id"]

    streamed = operator_client.get(f"/api/v1/videos/{video_id}/stream")

    assert streamed.status_code == 200
    assert streamed.content == tiny_video_bytes
    assert streamed.headers["content-length"] == str(len(tiny_video_bytes))


def test_corrupt_or_disguised_video_is_rejected(
    operator_client,
    corrupt_ftyp_bytes,
):
    response = _upload_fictitious(
        operator_client,
        corrupt_ftyp_bytes,
    )

    assert response.status_code == 415


def test_video_without_audio_is_rejected_before_encrypted_persistence(
    operator_client,
    silent_mp4,
):
    response = _upload_fictitious(operator_client, silent_mp4)

    assert response.status_code == 422
    assert response.json()["detail"] == "El video no contiene una pista de audio"
    storage = operator_client.app.state.settings.storage_dir / "videos"
    assert not storage.exists() or list(storage.iterdir()) == []


def test_missing_media_tool_maps_to_503_without_leaking_diagnostics(
    operator_client,
    valid_mp4_bytes,
    monkeypatch,
):
    def unavailable(*_args, **_kwargs):
        raise MediaToolUnavailableError(
            "ffprobe: /private/testimony/path: Invalid data found"
        )

    monkeypatch.setattr(
        operator_client.app.state.videos.media_validator,
        "validate",
        unavailable,
    )

    response = _upload_fictitious(operator_client, valid_mp4_bytes)

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "El servicio de validación audiovisual no está disponible"
    )


def test_demo_endpoint_creates_only_a_fictitious_record(operator_client):
    response = operator_client.post("/api/v1/videos/demo")

    assert response.status_code == 201
    assert response.json()["is_demo"] is True
    streamed = operator_client.get(
        f"/api/v1/videos/{response.json()['id']}/stream"
    )
    assert streamed.status_code == 200
    assert streamed.content[4:8] == b"ftyp"


def test_demo_video_is_a_browser_playable_synthetic_mp4(
    operator_client,
    tmp_path,
):
    video = operator_client.post("/api/v1/videos/demo").json()
    content = operator_client.get(
        f"/api/v1/videos/{video['id']}/stream"
    ).content
    fixture = tmp_path / "demo.mp4"
    fixture.write_bytes(content)

    inspected = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(fixture),
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert inspected.returncode == 0
    assert float(inspected.stdout.strip()) > 1


def test_stream_rejects_multiple_or_unsatisfiable_ranges(
    operator_client, tiny_video_bytes
):
    uploaded = _upload_fictitious(operator_client, tiny_video_bytes)
    video_id = uploaded.json()["id"]

    multiple = operator_client.get(
        f"/api/v1/videos/{video_id}/stream",
        headers={"Range": "bytes=0-10,30-40"},
    )
    beyond = operator_client.get(
        f"/api/v1/videos/{video_id}/stream",
        headers={"Range": f"bytes={len(tiny_video_bytes)}-"},
    )

    assert multiple.status_code == 416
    assert beyond.status_code == 416
    assert beyond.headers["content-range"] == f"bytes */{len(tiny_video_bytes)}"


# ── Ingesta por enlace ─────────────────────────────────────────────────────


class _DescargaFalsa:
    """Deja en disco el mismo MP4 de las demás pruebas, sin salir a la red."""

    def __init__(self, payload: bytes, duration: int = 120) -> None:
        self.payload = payload
        self.duration = duration
        self.downloaded: list[str] = []

    def fetch(self, url: str, destination, max_seconds: int):
        from app.services.video_links import RemoteVideo, VideoTooLongError

        if self.duration > max_seconds:
            raise VideoTooLongError(
                f"El video dura {self.duration // 60} minutos y el máximo son "
                f"{max_seconds // 60}."
            )
        self.downloaded.append(url)
        archivo = destination / "descargado.mp4"
        archivo.write_bytes(self.payload)
        return RemoteVideo(path=archivo, title="Testimonio", duration_seconds=self.duration)


def _encender_enlaces(client, payload: bytes, duration: int = 120) -> _DescargaFalsa:
    from app.services.video_links import VideoLinkService

    descargador = _DescargaFalsa(payload, duration)
    client.app.state.video_links = VideoLinkService(
        enabled=True,
        max_duration_seconds=1800,
        downloader=descargador,
    )
    return descargador


def test_un_enlace_de_youtube_entra_por_el_mismo_camino_que_un_archivo(
    operator_client, tiny_video_bytes
):
    """Lo que importa no es que responda 201, sino que el video quede igual."""
    descargador = _encender_enlaces(operator_client, tiny_video_bytes)

    creado = operator_client.post(
        "/api/v1/videos/link",
        json={"url": "https://youtu.be/E6ikYBkI2QE&t=10"},
    )

    assert creado.status_code == 201
    # El enlace llegó normalizado al descargador, sin la marca de tiempo.
    assert descargador.downloaded == ["https://www.youtube.com/watch?v=E6ikYBkI2QE"]

    servido = operator_client.get(f"/api/v1/videos/{creado.json()['id']}/stream")
    assert servido.status_code == 200
    assert servido.content == tiny_video_bytes


def test_sin_el_interruptor_el_enlace_no_se_descarga(operator_client):
    """Estado por omisión del servidor: la ruta existe y dice que está apagada."""
    respuesta = operator_client.post(
        "/api/v1/videos/link",
        json={"url": "https://youtu.be/E6ikYBkI2QE"},
    )

    assert respuesta.status_code == 503
    assert "desactivada" in respuesta.json()["detail"]


def test_un_enlace_que_no_es_de_youtube_se_explica(operator_client, tiny_video_bytes):
    _encender_enlaces(operator_client, tiny_video_bytes)

    respuesta = operator_client.post(
        "/api/v1/videos/link",
        json={"url": "https://vimeo.com/12345678"},
    )

    assert respuesta.status_code == 422
    assert "YouTube" in respuesta.json()["detail"]


def test_un_video_mas_largo_que_el_tope_no_se_baja(operator_client, tiny_video_bytes):
    descargador = _encender_enlaces(operator_client, tiny_video_bytes, duration=5400)

    respuesta = operator_client.post(
        "/api/v1/videos/link",
        json={"url": "https://youtu.be/E6ikYBkI2QE"},
    )

    assert respuesta.status_code == 422
    assert "minutos" in respuesta.json()["detail"]
    assert descargador.downloaded == []


def test_la_disponibilidad_del_enlace_se_publica_en_readiness(operator_client):
    listo = operator_client.get("/api/v1/analyses/readiness").json()

    assert listo["link_ingest_enabled"] is False
    assert listo["link_ingest_max_seconds"] == 1800

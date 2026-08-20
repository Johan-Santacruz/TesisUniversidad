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

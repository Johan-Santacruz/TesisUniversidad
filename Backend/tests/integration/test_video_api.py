from __future__ import annotations

import subprocess


def _upload_fictitious(operator_client, payload: bytes):
    return operator_client.post(
        "/api/v1/videos",
        files={"file": ("ficticio.mp4", payload, "video/mp4")},
        data={"data_kind": "fictitious"},
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


def test_real_upload_is_blocked_without_both_zdr_confirmations(
    operator_client, tiny_video_bytes
):
    response = operator_client.post(
        "/api/v1/videos",
        files={"file": ("real.mp4", tiny_video_bytes, "video/mp4")},
        data={
            "data_kind": "real",
            "explicit_consent": "true",
            "consent_reference": "ACTA-1",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "Los testimonios reales están bloqueados hasta confirmar ZDR y autorización"
    )


def test_real_upload_also_requires_explicit_per_video_consent(
    client, settings_factory, tiny_video_bytes
):
    from fastapi.testclient import TestClient

    from app.database import Database
    from app.main import create_app

    settings = settings_factory(
        real_data_enabled=True,
        openai_zdr_confirmed=True,
        anthropic_zdr_confirmed=True,
        institutional_authorization_id="ACTA-INSTITUCIONAL-1",
    )
    database = Database(settings.database_url)
    with TestClient(create_app(settings=settings, database=database)) as gated_client:
        login = gated_client.post(
            "/api/v1/auth/token",
            data={
                "username": "admin@siad.local",
                "password": "Cambiar-Esta-Clave-2026!",
            },
        )
        gated_client.headers["Authorization"] = (
            f"Bearer {login.json()['access_token']}"
        )
        response = gated_client.post(
            "/api/v1/videos",
            files={"file": ("real.mp4", tiny_video_bytes, "video/mp4")},
            data={"data_kind": "real", "explicit_consent": "false"},
        )

    database.dispose()
    assert response.status_code == 422


def test_corrupt_or_disguised_video_is_rejected(operator_client):
    response = _upload_fictitious(
        operator_client,
        "Este archivo no contiene una firma audiovisual válida".encode(),
    )

    assert response.status_code == 415


def test_demo_endpoint_creates_only_a_fictitious_record(operator_client):
    response = operator_client.post("/api/v1/videos/demo")

    assert response.status_code == 201
    assert response.json()["is_demo"] is True
    assert response.json()["data_kind"] == "fictitious"
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

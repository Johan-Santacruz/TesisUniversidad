from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.entities import CaseRecord, RenderedVideo, Video, VideoChunk
from tests.integration.case_helpers import (
    APPROVAL_PAYLOAD,
    confirm_critical_facts,
    create_demo_case,
    create_validator,
    login,
)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


class _CopyRenderer:
    def __init__(self, rendered_bytes: bytes) -> None:
        self.rendered_bytes = rendered_bytes

    def render(self, _video, _image, target) -> None:
        target.write(self.rendered_bytes)
        target.seek(0)


def _approve_memory_image_with_derivative(client, case_id: str) -> str:
    database = client.app.state.database
    with database.session() as session:
        case = session.get(CaseRecord, case_id)
        assert case is not None
        original = session.get(Video, case.video_id)
        assert original is not None
        original_bytes = client.app.state.videos.open_plain_bytes(original)
    client.app.state.memory_images.renderer = _CopyRenderer(original_bytes)
    response = client.post(
        f"/api/v1/cases/{case_id}/memory-image/decision",
        json={"action": "approve"},
    )
    assert response.status_code == 200
    with database.session() as session:
        rendered = session.scalar(
            select(RenderedVideo).where(RenderedVideo.case_id == case_id)
        )
        assert rendered is not None
        assert rendered.status == "ready"
        assert rendered.video_id is not None
        return rendered.video_id


def test_due_video_deletion_is_idempotent(operator_client, tiny_video_bytes):
    uploaded = operator_client.post(
        "/api/v1/videos",
        files={"file": ("ficticio.mp4", tiny_video_bytes, "video/mp4")},
    )
    video_id = uploaded.json()["id"]
    database = operator_client.app.state.database
    due = datetime.now(timezone.utc)
    with database.session() as session:
        video = session.get(Video, video_id)
        video.delete_after = due
        encrypted_paths = [
            operator_client.app.state.settings.storage_dir / chunk.storage_path
            for chunk in video.chunks
        ]
    assert encrypted_paths
    assert all(path.exists() for path in encrypted_paths)

    retention = operator_client.app.state.retention
    with database.session() as session:
        assert retention.delete_due_videos(session, now=due) == 1
    assert retention.process_pending() == 1
    with database.session() as session:
        assert retention.delete_due_videos(
            session, now=due + timedelta(days=1)
        ) == 0
    assert all(not path.exists() for path in encrypted_paths)

    streamed = operator_client.get(f"/api/v1/videos/{video_id}/stream")
    assert streamed.status_code == 410


def test_video_before_retention_deadline_is_preserved(
    operator_client, tiny_video_bytes
):
    uploaded = operator_client.post(
        "/api/v1/videos",
        files={"file": ("ficticio.mp4", tiny_video_bytes, "video/mp4")},
    )
    video_id = uploaded.json()["id"]
    database = operator_client.app.state.database
    now = datetime.now(timezone.utc)
    with database.session() as session:
        video = session.get(Video, video_id)
        video.delete_after = now + timedelta(days=7)

    with database.session() as session:
        assert operator_client.app.state.retention.delete_due_videos(
            session, now=now
        ) == 0

    assert operator_client.get(f"/api/v1/videos/{video_id}/stream").status_code == 200


def test_retention_keeps_encrypted_chunks_when_the_transaction_rolls_back(
    operator_client, tiny_video_bytes
):
    """Breaks if retention unlinks ciphertext before the database transaction commits."""
    uploaded = operator_client.post(
        "/api/v1/videos",
        files={"file": ("ficticio.mp4", tiny_video_bytes, "video/mp4")},
    )
    video_id = uploaded.json()["id"]
    database = operator_client.app.state.database
    now = datetime.now(timezone.utc)
    with database.session() as session:
        video = session.get(Video, video_id)
        assert video is not None
        video.delete_after = now
        encrypted_paths = [
            operator_client.app.state.settings.storage_dir / chunk.storage_path
            for chunk in video.chunks
        ]
    assert encrypted_paths and all(path.exists() for path in encrypted_paths)

    with pytest.raises(RuntimeError, match="force rollback"):
        with database.session() as session:
            assert operator_client.app.state.retention.delete_due_videos(session, now=now) == 1
            raise RuntimeError("force rollback")

    with database.session() as session:
        video = session.get(Video, video_id)
        assert video is not None
        assert video.status == "uploaded"
        assert video.deleted_at is None
    assert all(path.exists() for path in encrypted_paths)


def test_retention_expires_original_and_existing_memory_derivative_together(client):
    """Breaks if approving a case leaves an existing closing derivative without a deadline."""
    case_id = create_demo_case(client)
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")
    derivative_id = _approve_memory_image_with_derivative(client, case_id)
    confirm_critical_facts(client, case_id)
    approved = client.post(f"/api/v1/cases/{case_id}/approve", json=APPROVAL_PAYLOAD)
    assert approved.status_code == 200
    deadline = datetime.fromisoformat(approved.json()["video_delete_after"])

    database = client.app.state.database
    storage_dir = client.app.state.settings.storage_dir
    with database.session() as session:
        case = session.get(CaseRecord, case_id)
        assert case is not None
        original = session.get(Video, case.video_id)
        derivative = session.get(Video, derivative_id)
        assert original is not None
        assert derivative is not None
        assert original.delete_after is not None
        assert derivative.delete_after is not None
        assert _as_utc(original.delete_after) == deadline
        assert _as_utc(derivative.delete_after) == deadline
        chunk_paths = [
            storage_dir / path
            for path in session.scalars(
                select(VideoChunk.storage_path).where(
                    VideoChunk.video_id.in_([original.id, derivative.id])
                )
            )
        ]
    assert chunk_paths and all(path.exists() for path in chunk_paths)

    with database.session() as session:
        assert client.app.state.retention.delete_due_videos(session, now=deadline) == 2
    assert client.app.state.retention.process_pending() == 2
    with database.session() as session:
        preserved_case = session.get(CaseRecord, case_id)
        assert preserved_case is not None
        assert preserved_case.status == "approved"
        assert session.get(Video, original.id).status == "deleted"
        assert session.get(Video, derivative.id).status == "deleted"
        rendered = session.scalar(
            select(RenderedVideo).where(RenderedVideo.video_id == derivative.id)
        )
        assert rendered is not None
        assert rendered.status == "expired"
    assert all(not path.exists() for path in chunk_paths)
    summary = client.get(f"/api/v1/cases/{case_id}").json()["memory_image"]
    assert summary["render_status"] == "expired"
    assert summary["rendered_video_url"] is None


def test_derivative_created_after_case_approval_inherits_retention_deadline(client):
    """Breaks if a closing rendered after approval loses the original retention deadline."""
    case_id = create_demo_case(client)
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")
    confirm_critical_facts(client, case_id)
    approved = client.post(f"/api/v1/cases/{case_id}/approve", json=APPROVAL_PAYLOAD)
    assert approved.status_code == 200
    deadline = datetime.fromisoformat(approved.json()["video_delete_after"])

    derivative_id = _approve_memory_image_with_derivative(client, case_id)

    with client.app.state.database.session() as session:
        case = session.get(CaseRecord, case_id)
        assert case is not None
        original = session.get(Video, case.video_id)
        derivative = session.get(Video, derivative_id)
        assert original is not None
        assert derivative is not None
        assert original.delete_after is not None
        assert derivative.delete_after is not None
        assert _as_utc(original.delete_after) == deadline
        assert _as_utc(derivative.delete_after) == deadline

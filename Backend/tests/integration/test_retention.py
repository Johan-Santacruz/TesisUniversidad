from __future__ import annotations

from datetime import datetime, timedelta, timezone
from app.models import Video


def test_due_video_deletion_is_idempotent(operator_client, tiny_video_bytes):
    uploaded = operator_client.post(
        "/api/v1/videos",
        files={"file": ("ficticio.mp4", tiny_video_bytes, "video/mp4")},
        data={"data_kind": "fictitious"},
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
        data={"data_kind": "fictitious"},
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

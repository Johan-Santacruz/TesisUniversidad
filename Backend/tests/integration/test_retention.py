from __future__ import annotations

from datetime import datetime, timedelta, timezone
from io import BytesIO

from app.models import Video
from app.schemas import DataKind


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


def test_real_video_receives_retention_deadline_at_upload_time(
    settings_factory, tiny_video_bytes
):
    from fastapi.testclient import TestClient

    from app.database import Database
    from app.main import create_app
    from app.models import User

    settings = settings_factory(
        real_data_enabled=True,
        openai_zdr_confirmed=True,
        anthropic_zdr_confirmed=True,
        institutional_authorization_id="ACTA-INSTITUCIONAL-1",
        openai_api_key="test-openai-key",
        anthropic_api_key="test-anthropic-key",
    )
    database = Database(settings.database_url)
    upload_time = datetime(2026, 7, 29, 12)
    with TestClient(create_app(settings=settings, database=database)) as application:
        with database.session() as session:
            user = session.query(User).filter_by(email="admin@siad.local").one()
            uploaded_real = application.app.state.videos.create(
                session,
                user=user,
                source=BytesIO(tiny_video_bytes),
                data_kind=DataKind.REAL,
                explicit_consent=True,
                consent_reference="ACTA-1",
                now=upload_time,
            )
            assert uploaded_real.data_kind == "real"

        with database.session() as session:
            stored = session.get(Video, uploaded_real.id)
            assert stored is not None
            assert stored.delete_after == upload_time + timedelta(days=7)

    database.dispose()

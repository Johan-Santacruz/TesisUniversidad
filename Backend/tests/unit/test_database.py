from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.database import Database
from app.models import Analysis, RefreshSession, User, Video


def test_session_context_commits_successful_changes():
    database = Database("sqlite://")
    database.create_schema()

    with database.session() as session:
        session.add(
            User(
                id="user-1",
                email="admin@siad.local",
                password_hash="$argon2id$placeholder",
                role="admin",
            )
        )

    with database.session() as session:
        assert session.get(User, "user-1").email == "admin@siad.local"


def test_session_context_rolls_back_failed_changes():
    database = Database("sqlite://")
    database.create_schema()

    with pytest.raises(RuntimeError, match="abort"):
        with database.session() as session:
            session.add(
                User(
                    id="user-1",
                    email="admin@siad.local",
                    password_hash="$argon2id$placeholder",
                    role="admin",
                )
            )
            raise RuntimeError("abort")

    with database.session() as session:
        assert session.get(User, "user-1") is None


def test_sqlite_foreign_keys_reject_orphan_refresh_sessions():
    database = Database("sqlite://")
    database.create_schema()

    with pytest.raises(IntegrityError):
        with database.session() as session:
            session.add(
                RefreshSession(
                    id="session-1",
                    user_id="missing-user",
                    token_jti_hash="hash",
                    expires_at=datetime.now(timezone.utc) + timedelta(hours=8),
                )
            )


def test_one_video_has_one_durable_analysis():
    database = Database("sqlite://")
    database.create_schema()

    try:
        with database.session() as session:
            user = User(
                id="user-analysis",
                email="analysis@siad.local",
                password_hash="$argon2id$placeholder",
                role="operador",
            )
            video = Video(
                id="video-analysis",
                owner_id=user.id,
                filename="analysis.mp4",
                media_type="video/mp4",
                size_bytes=1,
                chunk_size=1,
                key_version=1,
                data_kind="demo",
            )
            session.add_all([user, video])
            session.flush()
            session.add_all(
                [
                    Analysis(
                        id="analysis-1",
                        video_id=video.id,
                        requested_by_id=user.id,
                    ),
                    Analysis(
                        id="analysis-2",
                        video_id=video.id,
                        requested_by_id=user.id,
                    ),
                ]
            )
            with pytest.raises(IntegrityError):
                session.flush()
            session.rollback()
    finally:
        database.dispose()

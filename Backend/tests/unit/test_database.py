from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.database import Database
from app.models import RefreshSession, User


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


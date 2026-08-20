from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from app.database import Database
from app.entities import Analysis, RefreshSession, User, Video


def test_session_context_commits_successful_changes():
    database = Database("sqlite://")
    database.create_schema()

    with database.session() as session:
        session.add(
            User(
                id="user-1",
                email="admin@senda.local",
                password_hash="$argon2id$placeholder",
                role="admin",
            )
        )

    with database.session() as session:
        assert session.get(User, "user-1").email == "admin@senda.local"


def test_session_context_rolls_back_failed_changes():
    database = Database("sqlite://")
    database.create_schema()

    with pytest.raises(RuntimeError, match="abort"):
        with database.session() as session:
            session.add(
                User(
                    id="user-1",
                    email="admin@senda.local",
                    password_hash="$argon2id$placeholder",
                    role="admin",
                )
            )
            raise RuntimeError("abort")

    with database.session() as session:
        assert session.get(User, "user-1") is None


def test_root_transaction_callbacks_ignore_savepoint_commit_and_run_after_outer_rollback():
    """Breaks if a savepoint clears video cleanup before its outer transaction ends."""
    database = Database("sqlite://")
    database.create_schema()
    outcomes: list[str] = []

    with pytest.raises(RuntimeError, match="abort outer"):
        with database.session() as session:
            Database.on_root_commit(session, lambda: outcomes.append("commit"))
            Database.on_root_rollback(session, lambda: outcomes.append("rollback"))
            with session.begin_nested():
                pass
            assert outcomes == []
            raise RuntimeError("abort outer")

    assert outcomes == ["rollback"]


def test_root_transaction_callbacks_clear_rollback_work_only_after_commit():
    """Breaks if committed encrypted media is queued for deletion by a stale callback."""
    database = Database("sqlite://")
    database.create_schema()
    outcomes: list[str] = []

    with database.session() as session:
        Database.on_root_commit(session, lambda: outcomes.append("commit"))
        Database.on_root_rollback(session, lambda: outcomes.append("rollback"))
        with session.begin_nested():
            pass
        assert outcomes == []

    assert outcomes == ["commit"]


def test_explicit_commit_dispatches_only_commit_callbacks_before_a_later_exception():
    """Breaks if a successful root commit is later reclassified as a rollback."""
    database = Database("sqlite://")
    database.create_schema()
    outcomes: list[str] = []

    with pytest.raises(RuntimeError, match="after commit"):
        with database.session() as session:
            Database.on_root_commit(session, lambda: outcomes.append("commit"))
            Database.on_root_rollback(session, lambda: outcomes.append("rollback"))
            session.commit()
            raise RuntimeError("after commit")

    assert outcomes == ["commit"]


def test_explicit_rollback_dispatches_once_and_session_can_start_a_new_root_transaction():
    """Breaks if rollback callbacks wait for the context exit or leak into reuse."""
    database = Database("sqlite://")
    database.create_schema()
    outcomes: list[str] = []

    with database.session() as session:
        Database.on_root_rollback(session, lambda: outcomes.append("rollback"))
        session.add(
            User(
                id="rollback-user",
                email="rollback@senda.local",
                password_hash="$argon2id$placeholder",
                role="admin",
            )
        )
        session.rollback()
        Database.on_root_commit(session, lambda: outcomes.append("commit"))
        session.add(
            User(
                id="committed-user",
                email="committed@senda.local",
                password_hash="$argon2id$placeholder",
                role="admin",
            )
        )

    assert outcomes == ["rollback", "commit"]
    with database.session() as session:
        assert session.get(User, "rollback-user") is None
        assert session.get(User, "committed-user") is not None


def test_close_with_active_root_transaction_dispatches_rollback_but_close_after_commit_does_not():
    """Breaks if close silently drops cleanup or replays it after a completed commit."""
    database = Database("sqlite://")
    database.create_schema()
    outcomes: list[str] = []

    with database.session() as session:
        session.add(
            User(
                id="close-user",
                email="close@senda.local",
                password_hash="$argon2id$placeholder",
                role="admin",
            )
        )
        Database.on_root_rollback(session, lambda: outcomes.append("rollback"))
        session.close()

    with database.session() as session:
        Database.on_root_commit(session, lambda: outcomes.append("commit"))
        session.commit()
        session.close()

    assert outcomes == ["rollback", "commit"]


def test_callback_failure_propagates_without_turning_a_committed_root_transaction_into_rollback():
    """Breaks if an outbox failure is swallowed or a committed resource is rolled back."""
    database = Database("sqlite://")
    database.create_schema()
    outcomes: list[str] = []

    with pytest.raises(RuntimeError, match="outbox unavailable"):
        with database.session() as session:
            Database.on_root_commit(
                session,
                lambda: (_ for _ in ()).throw(RuntimeError("outbox unavailable")),
            )
            Database.on_root_rollback(session, lambda: outcomes.append("rollback"))

    assert outcomes == []


def test_failed_callback_is_retained_for_an_explicit_in_process_retry():
    """Breaks if an unrecoverable outbox callback disappears after it is surfaced."""
    database = Database("sqlite://")
    database.create_schema()
    attempts = 0

    def enqueue_once_after_failure() -> None:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError("database unavailable")

    with pytest.raises(RuntimeError, match="database unavailable"):
        with database.session() as session:
            Database.on_root_rollback(session, enqueue_once_after_failure)
            session.rollback()

    Database.retry_failed_root_callbacks(session)
    assert attempts == 2


def test_keyboard_interrupt_dispatches_root_rollback_callbacks():
    """Breaks if BaseException leaves encrypted temporary storage untracked."""
    database = Database("sqlite://")
    database.create_schema()
    outcomes: list[str] = []

    with pytest.raises(KeyboardInterrupt):
        with database.session() as session:
            Database.on_root_rollback(session, lambda: outcomes.append("rollback"))
            raise KeyboardInterrupt()

    assert outcomes == ["rollback"]


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
                email="analysis@senda.local",
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


def test_schema_creates_memory_image_tables_with_required_uniqueness():
    database = Database("sqlite://")
    database.create_schema()

    try:
        inspector = inspect(database.engine)

        assert {"memory_images", "rendered_videos"} <= set(
            inspector.get_table_names()
        )
        assert any(
            set(constraint["column_names"]) == {"case_id", "generation"}
            for constraint in inspector.get_unique_constraints("memory_images")
        )
        assert any(
            set(constraint["column_names"]) == {"memory_image_id"}
            for constraint in inspector.get_unique_constraints("rendered_videos")
        )
    finally:
        database.dispose()

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.entities import Base


class SendaSession(Session):
    """Session that delivers cleanup callbacks at each root transaction boundary."""

    _ROOT_COMMIT_CALLBACKS = "senda_root_commit_callbacks"
    _ROOT_ROLLBACK_CALLBACKS = "senda_root_rollback_callbacks"
    _FAILED_CALLBACKS = "senda_failed_root_callbacks"

    def commit(self) -> None:
        super().commit()
        self._dispatch_root_callbacks(
            self._ROOT_COMMIT_CALLBACKS, self._ROOT_ROLLBACK_CALLBACKS
        )

    def rollback(self) -> None:
        has_root_work = self.in_transaction() or bool(
            self.info.get(self._ROOT_COMMIT_CALLBACKS)
            or self.info.get(self._ROOT_ROLLBACK_CALLBACKS)
        )
        super().rollback()
        if has_root_work:
            self._dispatch_root_callbacks(
                self._ROOT_ROLLBACK_CALLBACKS, self._ROOT_COMMIT_CALLBACKS
            )

    def close(self) -> None:
        has_root_work = self.in_transaction() or bool(
            self.info.get(self._ROOT_COMMIT_CALLBACKS)
            or self.info.get(self._ROOT_ROLLBACK_CALLBACKS)
        )
        if has_root_work:
            self.rollback()
        super().close()

    def retry_failed_root_callbacks(self) -> None:
        callbacks = list(self.info.pop(self._FAILED_CALLBACKS, ()))
        for index, callback in enumerate(callbacks):
            try:
                callback()
            except BaseException:
                self.info.setdefault(self._FAILED_CALLBACKS, []).extend(callbacks[index:])
                raise

    def _dispatch_root_callbacks(self, key: str, discarded_key: str) -> None:
        callbacks = list(self.info.pop(key, ()))
        self.info.pop(discarded_key, None)
        for index, callback in enumerate(callbacks):
            try:
                callback()
            except BaseException:
                # The transaction outcome is final. Keep the failed cleanup in
                # process memory for an explicit retry rather than silently
                # losing its descriptor or reclassifying the outcome.
                self.info.setdefault(self._FAILED_CALLBACKS, []).extend(callbacks[index:])
                raise


class Database:
    _ROOT_COMMIT_CALLBACKS = SendaSession._ROOT_COMMIT_CALLBACKS
    _ROOT_ROLLBACK_CALLBACKS = SendaSession._ROOT_ROLLBACK_CALLBACKS

    def __init__(self, url: str) -> None:
        engine_options: dict[str, object] = {}
        if url.startswith("sqlite"):
            engine_options["connect_args"] = {"check_same_thread": False}
        if url in {"sqlite://", "sqlite:///:memory:"}:
            engine_options["poolclass"] = StaticPool

        self.engine = create_engine(url, **engine_options)
        if url.startswith("sqlite"):
            event.listen(self.engine, "connect", self._configure_sqlite)
        self._session_factory = sessionmaker(
            bind=self.engine,
            class_=SendaSession,
            expire_on_commit=False,
            autoflush=False,
        )

    @staticmethod
    def _configure_sqlite(dbapi_connection: object, _: object) -> None:
        cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    def create_schema(self) -> None:
        Base.metadata.create_all(self.engine)

    @classmethod
    def on_root_commit(cls, session: Session, callback: Callable[[], None]) -> None:
        session.info.setdefault(cls._ROOT_COMMIT_CALLBACKS, []).append(callback)

    @classmethod
    def on_root_rollback(cls, session: Session, callback: Callable[[], None]) -> None:
        session.info.setdefault(cls._ROOT_ROLLBACK_CALLBACKS, []).append(callback)

    @classmethod
    def retry_failed_root_callbacks(cls, session: Session) -> None:
        if not isinstance(session, SendaSession):
            raise TypeError("SENDA root callbacks require a SENDA session")
        session.retry_failed_root_callbacks()

    @contextmanager
    def session(self) -> Iterator[Session]:
        session = self._session_factory()
        try:
            yield session
        except BaseException:
            session.rollback()
            raise
        else:
            session.commit()
        finally:
            session.close()

    def dispose(self) -> None:
        self.engine.dispose()

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import errno
import os
from pathlib import Path, PurePosixPath
import sqlite3
import time
from typing import Any
from uuid import UUID, uuid4

from cryptography.exceptions import InvalidTag
from sqlalchemy import and_, or_, select, update
from sqlalchemy.exc import OperationalError

from app.database import Database
from app.entities import PurgeJob
from app.security.crypto import EnvelopeCipher
from app.services.assets import EncryptedAssetStore, StoredAsset


_PURPOSE = "purge_job"
_LEASE_SECONDS = 60
_ENQUEUE_RETRY_SECONDS = 5.0


class PurgeService:
    """Persists cleanup intent before rows holding descriptors disappear."""

    def __init__(
        self,
        *,
        database: Database,
        cipher: EnvelopeCipher,
        assets: EncryptedAssetStore,
        storage_dir: Path,
    ) -> None:
        self.database = database
        self.cipher = cipher
        self.assets = assets
        self.storage_dir = Path(storage_dir)

    def enqueue_asset(self, session: Any, *, asset_id: str, asset: StoredAsset) -> None:
        self._enqueue(
            session,
            "memory_image",
            {
                "asset_id": str(UUID(asset_id)),
                "asset": {
                    "key_version": asset.key_version,
                    "nonce": asset.nonce.hex(),
                    "storage_path": asset.storage_path,
                    "plaintext_size": asset.plaintext_size,
                    "ciphertext_size": asset.ciphertext_size,
                },
            },
        )

    def enqueue_video(
        self, session: Any, *, video_id: str, storage_paths: list[str]
    ) -> None:
        canonical_video_id = str(UUID(video_id))
        self._enqueue(
            session,
            "video",
            {"video_id": canonical_video_id, "storage_paths": list(storage_paths)},
        )

    def enqueue_asset_now(self, *, asset_id: str, asset: StoredAsset) -> None:
        """Commit cleanup intent before an in-flight producer drops its row."""
        self._enqueue_now(
            lambda session: self.enqueue_asset(session, asset_id=asset_id, asset=asset)
        )

    def enqueue_video_now(self, *, video_id: str, storage_paths: list[str]) -> None:
        """Commit cleanup intent before an in-flight producer drops its row."""
        self._enqueue_now(
            lambda session: self.enqueue_video(
                session, video_id=video_id, storage_paths=storage_paths
            )
        )

    def discover_video_storage_paths(self, video_id: str) -> list[str]:
        """Return only canonical encrypted chunks under the expected safe directory."""
        canonical_id = str(UUID(video_id))
        storage_fd: int | None = None
        videos_fd: int | None = None
        video_fd: int | None = None
        try:
            flags = self._directory_open_flags()
            storage_fd = os.open(os.fspath(self.storage_dir), flags)
            videos_fd = os.open("videos", flags, dir_fd=storage_fd)
            video_fd = os.open(canonical_id, flags, dir_fd=videos_fd)
            names = os.listdir(video_fd)
            return [
                f"videos/{canonical_id}/{name}"
                for name in names
                if self._is_canonical_chunk_name(name)
            ]
        except (FileNotFoundError, OSError):
            return []
        finally:
            for fd in (video_fd, videos_fd, storage_fd):
                if fd is not None:
                    os.close(fd)

    def _enqueue_now(self, enqueue: Any) -> None:
        deadline = time.monotonic() + _ENQUEUE_RETRY_SECONDS
        delay = 0.01
        while True:
            try:
                with self.database.session() as session:
                    enqueue(session)
                return
            except OperationalError as exc:
                if not self._is_transient_sqlite_lock(exc) or time.monotonic() >= deadline:
                    raise
                time.sleep(delay)
                delay = min(delay * 2, 0.25)

    def _is_transient_sqlite_lock(self, exc: OperationalError) -> bool:
        if self.database.engine.dialect.name != "sqlite":
            return False
        original = exc.orig
        return isinstance(original, sqlite3.OperationalError) and any(
            marker in str(original).lower() for marker in ("locked", "busy")
        )

    def _enqueue(self, session: Any, resource_type: str, value: dict[str, Any]) -> None:
        job_id = str(uuid4())
        encrypted = self.cipher.encrypt_json(job_id, _PURPOSE, value)
        session.add(
            PurgeJob(
                id=job_id,
                resource_type=resource_type,
                key_version=encrypted.key_version,
                nonce=encrypted.nonce,
                ciphertext=encrypted.ciphertext,
            )
        )

    def process_pending(self) -> int:
        with self.database.session() as session:
            job_ids = list(session.scalars(select(PurgeJob.id).order_by(PurgeJob.created_at)))
        processed = 0
        for job_id in job_ids:
            if self._process_one(job_id):
                processed += 1
        return processed

    def _process_one(self, job_id: str) -> bool:
        token = str(uuid4())
        now = datetime.now(timezone.utc)
        expires = now + timedelta(seconds=_LEASE_SECONDS)
        with self.database.session() as session:
            claimed = session.execute(
                update(PurgeJob)
                .where(
                    PurgeJob.id == job_id,
                    or_(
                        PurgeJob.lease_token.is_(None),
                        PurgeJob.lease_expires_at.is_(None),
                        PurgeJob.lease_expires_at <= now,
                    ),
                )
                .values(lease_token=token, lease_expires_at=expires)
                .execution_options(synchronize_session=False)
            )
            if claimed.rowcount != 1:
                return False
            job = session.get(PurgeJob, job_id)
            if job is None:
                return False
            try:
                value = self.cipher.decrypt_json(
                    job.id, _PURPOSE, job.encrypted_payload()
                )
                if not isinstance(value, dict):
                    raise ValueError("invalid purge payload")
                if job.resource_type == "memory_image":
                    self._purge_asset(value)
                elif job.resource_type == "video":
                    self._purge_video(value)
                else:
                    raise ValueError("unknown purge resource")
            except (InvalidTag, OSError, ValueError, KeyError, TypeError):
                session.execute(
                    update(PurgeJob)
                    .where(PurgeJob.id == job_id, PurgeJob.lease_token == token)
                    .values(lease_token=None, lease_expires_at=None)
                    .execution_options(synchronize_session=False)
                )
                return False
            completed = session.execute(
                update(PurgeJob)
                .where(PurgeJob.id == job_id, PurgeJob.lease_token == token)
                .values(lease_token="completed", lease_expires_at=expires)
                .execution_options(synchronize_session=False)
            )
            if completed.rowcount != 1:
                return False
            session.delete(job)
            return True

    def _purge_asset(self, value: dict[str, Any]) -> None:
        asset_value = value["asset"]
        if not isinstance(asset_value, dict):
            raise ValueError("invalid asset purge payload")
        asset = StoredAsset(
            key_version=int(asset_value["key_version"]),
            nonce=bytes.fromhex(str(asset_value["nonce"])),
            storage_path=str(asset_value["storage_path"]),
            plaintext_size=int(asset_value["plaintext_size"]),
            ciphertext_size=int(asset_value["ciphertext_size"]),
        )
        self.assets.delete(str(value["asset_id"]), asset)

    def _purge_video(self, value: dict[str, Any]) -> None:
        video_id = str(UUID(str(value["video_id"])))
        paths = value["storage_paths"]
        if not isinstance(paths, list):
            raise ValueError("invalid video purge payload")
        expected_directory = PurePosixPath("videos") / video_id
        validated: list[str] = []
        for raw_path in paths:
            path = PurePosixPath(str(raw_path))
            if path.is_absolute() or path.parent != expected_directory:
                raise ValueError("video path does not match video id")
            if not self._is_canonical_chunk_name(path.name):
                raise ValueError("invalid video chunk name")
            validated.append(path.name)
        storage_fd: int | None = None
        videos_fd: int | None = None
        video_fd: int | None = None
        try:
            flags = self._directory_open_flags()
            try:
                storage_fd = os.open(os.fspath(self.storage_dir), flags)
                videos_fd = os.open("videos", flags, dir_fd=storage_fd)
                video_fd = os.open(video_id, flags, dir_fd=videos_fd)
            except FileNotFoundError:
                return
            for filename in validated:
                try:
                    os.unlink(filename, dir_fd=video_fd)
                except FileNotFoundError:
                    pass
            # Keep the descriptor open while removing its name. Reopening with
            # O_NOFOLLOW makes a substituted symlink or directory a retryable
            # failure instead of a cross-case delete.
            current_fd = os.open(video_id, flags, dir_fd=videos_fd)
            try:
                if os.fstat(current_fd) != os.fstat(video_fd):
                    raise OSError(errno.ESTALE, "video directory changed during purge")
            finally:
                os.close(current_fd)
            os.rmdir(video_id, dir_fd=videos_fd)
        finally:
            for fd in (video_fd, videos_fd, storage_fd):
                if fd is not None:
                    os.close(fd)

    @staticmethod
    def _directory_open_flags() -> int:
        no_follow = getattr(os, "O_NOFOLLOW", None)
        if no_follow is None:
            raise OSError("secure purge requires O_NOFOLLOW support")
        return (
            os.O_RDONLY
            | getattr(os, "O_DIRECTORY", 0)
            | no_follow
            | getattr(os, "O_CLOEXEC", 0)
        )

    @staticmethod
    def _is_canonical_chunk_name(name: str) -> bool:
        return (
            len(name) == 12
            and name.endswith(".bin")
            and name[:8].isdigit()
        )

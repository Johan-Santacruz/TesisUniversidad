from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Video
from app.services.audit import AuditService


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


class RetentionService:
    def __init__(self, audit: AuditService, storage_dir: Path) -> None:
        self.audit = audit
        self.storage_dir = storage_dir

    def delete_due_videos(self, session: Session, *, now: datetime) -> int:
        due_videos = list(
            session.scalars(
                select(Video).where(
                    Video.delete_after.is_not(None),
                    Video.deleted_at.is_(None),
                )
            )
        )
        deleted = 0
        for video in due_videos:
            if video.delete_after is None or _as_utc(video.delete_after) > now:
                continue
            chunk_directories: set[Path] = set()
            for chunk in list(video.chunks):
                chunk_path = self.storage_dir / chunk.storage_path
                chunk_directories.add(chunk_path.parent)
                chunk_path.unlink(missing_ok=True)
                session.delete(chunk)
            for directory in chunk_directories:
                try:
                    directory.rmdir()
                except OSError:
                    pass
            video.deleted_at = now
            video.status = "deleted"
            session.add(
                self.audit.build_record(
                    actor_id=None,
                    actor_role="system",
                    action="video_retention_deleted",
                    entity_type="video",
                    entity_id=video.id,
                    details={"scheduled": True},
                )
            )
            deleted += 1
        return deleted

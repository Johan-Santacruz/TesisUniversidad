from __future__ import annotations

from datetime import datetime, timezone
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.entities import RenderedVideo, Video
from app.services.audit import AuditService
from app.services.purges import PurgeService


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


class RetentionService:
    def __init__(self, audit: AuditService, purges: PurgeService) -> None:
        self.audit = audit
        self.purges = purges

    def delete_due_videos(self, session: Session, *, now: datetime) -> int:
        due_video_ids = list(
            session.scalars(
                select(Video.id).where(
                    Video.delete_after.is_not(None), Video.deleted_at.is_(None)
                )
            )
        )
        deleted = 0
        for video_id in due_video_ids:
            video = session.get(Video, video_id)
            if video is None:
                continue
            if video.delete_after is None or _as_utc(video.delete_after) > now:
                continue
            lease_token = str(uuid4())
            claimed = session.execute(
                update(Video)
                .where(
                    Video.id == video.id,
                    Video.deleted_at.is_(None),
                    or_(
                        Video.retention_lease_token.is_(None),
                        Video.retention_lease_expires_at.is_(None),
                        Video.retention_lease_expires_at <= now,
                    ),
                )
                .values(
                    retention_lease_token=lease_token,
                    retention_lease_expires_at=now + timedelta(minutes=1),
                )
                .execution_options(synchronize_session=False)
            )
            if claimed.rowcount != 1:
                continue
            paths = [chunk.storage_path for chunk in video.chunks]
            for chunk in list(video.chunks):
                session.delete(chunk)
            video.deleted_at = now
            video.status = "deleted"
            video.retention_lease_token = None
            video.retention_lease_expires_at = None
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
            self.purges.enqueue_video(session, video_id=video.id, storage_paths=paths)
            session.execute(
                select(RenderedVideo).where(RenderedVideo.video_id == video.id)
            )
            for rendered in session.scalars(
                select(RenderedVideo).where(RenderedVideo.video_id == video.id)
            ):
                rendered.status = "expired"
                rendered.failure_code = "video_retention_expired"
            deleted += 1
        return deleted

    def process_pending(self) -> int:
        return self.purges.process_pending()

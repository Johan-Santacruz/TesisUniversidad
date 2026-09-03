from __future__ import annotations

from collections.abc import Callable
from shutil import which

from app.config import Settings
from app.schemas import AnalysisReadinessRead, UserRole


class AnalysisReadinessService:
    def __init__(
        self,
        *,
        settings: Settings,
        beto_available: bool | Callable[[], bool],
        command_available: Callable[[str], bool] | None = None,
    ) -> None:
        self.settings = settings
        self.beto_available = beto_available
        self.command_available = command_available or (lambda name: which(name) is not None)

    def check(self, role: UserRole) -> AnalysisReadinessRead:
        ffmpeg_available = self.command_available("ffmpeg")
        ffprobe_available = self.command_available("ffprobe")
        beto_available = (
            self.beto_available()
            if callable(self.beto_available)
            else self.beto_available
        )
        return AnalysisReadinessRead(
            can_upload=role in {UserRole.OPERATOR, UserRole.ADMIN},
            link_ingest_enabled=self.settings.link_ingest_enabled,
            link_ingest_max_seconds=self.settings.link_ingest_max_seconds,
            openai_configured=self.settings.openai_configured,
            anthropic_configured=self.settings.anthropic_configured,
            beto_available=beto_available,
            ffmpeg_available=ffmpeg_available,
            ffprobe_available=ffprobe_available,
            accepted_media_types=["video/mp4", "video/webm"],
            max_video_bytes=self.settings.max_video_bytes,
            video_retention_days=self.settings.video_retention_days,
        )

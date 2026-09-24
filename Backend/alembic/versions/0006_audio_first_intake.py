"""Remember the duration of the audio a video was analyzed with.

When the browser sends the audio first, the analysis runs before the video
arrives. The duration is what lets the server check, once the video lands,
that it is the same recording that was analyzed.

Revision ID: 0006_audio_first_intake
Revises: 0005_route_rebuild
Create Date: 2026-09-23
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0006_audio_first_intake"
down_revision: str | None = "0005_route_rebuild"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "videos",
        sa.Column("audio_duration_ms", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("videos", "audio_duration_ms")

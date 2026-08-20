"""Add memory-image closing persistence.

Revision ID: 0004_memory_image_closing
Revises: 0003_remove_real_data_gate
Create Date: 2026-08-10
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0004_memory_image_closing"
down_revision: str | None = "0003_remove_real_data_gate"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("cases", sa.Column("deletion_claimed_at", sa.DateTime(timezone=True)))
    op.add_column("videos", sa.Column("retention_lease_token", sa.String(length=36)))
    op.add_column("videos", sa.Column("retention_lease_expires_at", sa.DateTime(timezone=True)))
    op.create_index("ix_videos_retention_lease_token", "videos", ["retention_lease_token"])
    op.create_table(
        "memory_images",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("prompt_version", sa.String(length=64), nullable=False),
        sa.Column("context_hash", sa.String(length=64), nullable=False),
        sa.Column("image_mime_type", sa.String(length=80)),
        sa.Column("image_width", sa.Integer()),
        sa.Column("image_height", sa.Integer()),
        sa.Column("plaintext_size", sa.Integer()),
        sa.Column("key_version", sa.Integer(), nullable=False),
        sa.Column("nonce", sa.LargeBinary(length=12), nullable=False),
        sa.Column("ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("asset_key_version", sa.Integer()),
        sa.Column("asset_nonce", sa.LargeBinary(length=12)),
        sa.Column("storage_path", sa.String(length=512)),
        sa.Column("ciphertext_size", sa.Integer()),
        sa.Column("failure_code", sa.String(length=64)),
        sa.Column("reviewed_by_id", sa.String(length=36)),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["reviewed_by_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "case_id",
            "generation",
            name="uq_memory_images_case_id_generation",
        ),
    )
    op.create_index("ix_memory_images_case_id", "memory_images", ["case_id"])
    op.create_index(
        "uq_memory_images_case_active",
        "memory_images",
        ["case_id"],
        unique=True,
        sqlite_where=sa.text("status IN ('generating', 'pending_review')"),
        postgresql_where=sa.text("status IN ('generating', 'pending_review')"),
    )

    op.create_table(
        "rendered_videos",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("memory_image_id", sa.String(length=36), nullable=False),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("video_id", sa.String(length=36)),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("render_attempt_id", sa.String(length=36)),
        sa.Column("failure_code", sa.String(length=64)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["memory_image_id"], ["memory_images.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["video_id"], ["videos.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "memory_image_id",
            name="uq_rendered_videos_memory_image_id",
        ),
        sa.UniqueConstraint("video_id", name="uq_rendered_videos_video_id"),
    )
    op.create_index("ix_rendered_videos_case_id", "rendered_videos", ["case_id"])
    op.create_table(
        "purge_jobs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("resource_type", sa.String(length=24), nullable=False),
        sa.Column("lease_token", sa.String(length=36)),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("key_version", sa.Integer(), nullable=False),
        sa.Column("nonce", sa.LargeBinary(length=12), nullable=False),
        sa.Column("ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_purge_jobs_lease_token", "purge_jobs", ["lease_token"])


def downgrade() -> None:
    op.drop_index("ix_purge_jobs_lease_token", table_name="purge_jobs")
    op.drop_table("purge_jobs")
    op.drop_index("ix_rendered_videos_case_id", table_name="rendered_videos")
    op.drop_table("rendered_videos")
    op.drop_index("uq_memory_images_case_active", table_name="memory_images")
    op.drop_index("ix_memory_images_case_id", table_name="memory_images")
    op.drop_table("memory_images")
    op.drop_index("ix_videos_retention_lease_token", table_name="videos")
    op.drop_column("videos", "retention_lease_expires_at")
    op.drop_column("videos", "retention_lease_token")
    op.drop_column("cases", "deletion_claimed_at")

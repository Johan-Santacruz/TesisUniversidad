"""Initial encrypted SIAD schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-27
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> tuple[sa.Column, sa.Column]:
    return (
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def _encrypted() -> tuple[sa.Column, sa.Column, sa.Column]:
    return (
        sa.Column("key_version", sa.Integer(), nullable=False),
        sa.Column("nonce", sa.LargeBinary(length=12), nullable=False),
        sa.Column("ciphertext", sa.LargeBinary(), nullable=False),
    )


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=512), nullable=False),
        sa.Column("role", sa.String(length=24), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_table(
        "refresh_sessions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("token_jti_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("rotated_from_id", sa.String(length=36)),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("token_jti_hash"),
    )
    op.create_index("ix_refresh_sessions_user_id", "refresh_sessions", ["user_id"])
    op.create_table(
        "consents",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("consent_type", sa.String(length=32), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        *_encrypted(),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.create_index("ix_consents_user_id", "consents", ["user_id"])
    op.create_table(
        "videos",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("consent_id", sa.String(length=36)),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("media_type", sa.String(length=80), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("chunk_size", sa.Integer(), nullable=False),
        sa.Column("key_version", sa.Integer(), nullable=False),
        sa.Column("data_kind", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column("delete_after", sa.DateTime(timezone=True)),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["consent_id"], ["consents.id"]),
    )
    op.create_index("ix_videos_owner_id", "videos", ["owner_id"])
    op.create_table(
        "video_chunks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("video_id", sa.String(length=36), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("byte_start", sa.Integer(), nullable=False),
        sa.Column("byte_end", sa.Integer(), nullable=False),
        sa.Column("key_version", sa.Integer(), nullable=False),
        sa.Column("nonce", sa.LargeBinary(length=12), nullable=False),
        sa.Column("storage_path", sa.String(length=512), nullable=False),
        sa.Column("ciphertext_size", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["video_id"], ["videos.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("video_id", "chunk_index"),
    )
    op.create_index("ix_video_chunks_video_id", "video_chunks", ["video_id"])
    op.create_table(
        "analyses",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("video_id", sa.String(length=36), nullable=False),
        sa.Column("requested_by_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("current_stage", sa.String(length=32)),
        sa.Column("failure_code", sa.String(length=64)),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.ForeignKeyConstraint(["video_id"], ["videos.id"]),
        sa.ForeignKeyConstraint(["requested_by_id"], ["users.id"]),
    )
    op.create_index("ix_analyses_video_id", "analyses", ["video_id"])
    op.create_table(
        "analysis_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("analysis_id", sa.String(length=36), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=32), nullable=False),
        sa.Column("state", sa.String(length=24), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        *_encrypted(),
        sa.ForeignKeyConstraint(["analysis_id"], ["analyses.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("analysis_id", "sequence"),
    )
    op.create_index("ix_analysis_events_analysis_id", "analysis_events", ["analysis_id"])
    op.create_index(
        "ix_analysis_events_replay",
        "analysis_events",
        ["analysis_id", "sequence"],
    )
    op.create_table(
        "cases",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("analysis_id", sa.String(length=36), nullable=False),
        sa.Column("video_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("recommendation_status", sa.String(length=24), nullable=False),
        sa.Column("approved_by_id", sa.String(length=36)),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.ForeignKeyConstraint(["analysis_id"], ["analyses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["video_id"], ["videos.id"]),
        sa.ForeignKeyConstraint(["approved_by_id"], ["users.id"]),
        sa.UniqueConstraint("analysis_id"),
    )
    op.create_index("ix_cases_video_id", "cases", ["video_id"])
    op.create_table(
        "facts",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("fact_type", sa.String(length=40), nullable=False),
        sa.Column("origin", sa.String(length=20), nullable=False),
        sa.Column("verification_status", sa.String(length=24), nullable=False),
        sa.Column("confidence_band", sa.String(length=16), nullable=False),
        sa.Column("is_critical", sa.Boolean(), nullable=False),
        *_encrypted(),
        *_timestamps(),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_facts_case_id", "facts", ["case_id"])
    op.create_table(
        "routes",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("route_type", sa.String(length=32), nullable=False),
        sa.Column("verification_status", sa.String(length=24), nullable=False),
        sa.Column("confidence_band", sa.String(length=16), nullable=False),
        *_encrypted(),
        *_timestamps(),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("case_id", "route_type"),
    )
    op.create_index("ix_routes_case_id", "routes", ["case_id"])
    op.create_table(
        "source_entries",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("entity", sa.String(length=180), nullable=False),
        sa.Column("program", sa.String(length=255), nullable=False),
        sa.Column("coverage", sa.String(length=180), nullable=False),
        sa.Column("requirements", sa.Text(), nullable=False),
        sa.Column("contact", sa.Text(), nullable=False),
        sa.Column("url", sa.String(length=1024), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_kind", sa.String(length=24), nullable=False),
        sa.Column("route_types", sa.String(length=180), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        *_timestamps(),
    )
    op.create_table(
        "reviews",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("case_id", sa.String(length=36), nullable=False),
        sa.Column("fact_id", sa.String(length=36)),
        sa.Column("actor_id", sa.String(length=36), nullable=False),
        sa.Column("action", sa.String(length=24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        *_encrypted(),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fact_id"], ["facts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
    )
    op.create_index("ix_reviews_case_id", "reviews", ["case_id"])
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("actor_id", sa.String(length=36)),
        sa.Column("actor_role", sa.String(length=24), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=False),
        sa.Column("entity_id", sa.String(length=64), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        *_encrypted(),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
    )
    op.create_index("ix_audit_logs_entity_id", "audit_logs", ["entity_id"])
    op.create_table(
        "tombstones",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("case_id_hash", sa.String(length=64), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("actor_role", sa.String(length=24), nullable=False),
        sa.UniqueConstraint("case_id_hash"),
    )


def downgrade() -> None:
    for table_name in (
        "tombstones",
        "audit_logs",
        "reviews",
        "source_entries",
        "routes",
        "facts",
        "cases",
        "analysis_events",
        "analyses",
        "video_chunks",
        "videos",
        "consents",
        "refresh_sessions",
        "users",
    ):
        op.drop_table(table_name)

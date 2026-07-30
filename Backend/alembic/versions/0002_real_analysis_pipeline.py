"""Persist resumable analysis stages and encrypted model traces.

Revision ID: 0002_real_analysis_pipeline
Revises: 0001_initial
Create Date: 2026-07-29
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0002_real_analysis_pipeline"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _abort_if_duplicate_analyses_exist() -> None:
    duplicate = op.get_bind().execute(
        sa.text(
            """
            SELECT video_id
            FROM analyses
            GROUP BY video_id
            HAVING COUNT(*) > 1
            LIMIT 1
            """
        )
    ).first()
    if duplicate is not None:
        raise RuntimeError(
            "cannot enforce one durable analysis per video: "
            "duplicate analyses exist for one or more videos"
        )


def upgrade() -> None:
    _abort_if_duplicate_analyses_exist()

    with op.batch_alter_table("analyses") as batch_op:
        batch_op.add_column(
            sa.Column(
                "next_event_sequence",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("1"),
            )
        )
        batch_op.create_unique_constraint(
            "uq_analyses_video_id",
            ["video_id"],
        )

    op.execute(
        """
        UPDATE analyses
        SET next_event_sequence = COALESCE(
            (
                SELECT MAX(analysis_events.sequence) + 1
                FROM analysis_events
                WHERE analysis_events.analysis_id = analyses.id
            ),
            1
        )
        """
    )

    with op.batch_alter_table("analysis_events") as batch_op:
        batch_op.add_column(
            sa.Column(
                "generation",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("1"),
            )
        )
        batch_op.add_column(
            sa.Column(
                "attempt",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("1"),
            )
        )

    op.create_table(
        "analysis_stage_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("analysis_id", sa.String(length=36), nullable=False),
        sa.Column("stage", sa.String(length=32), nullable=False),
        sa.Column("state", sa.String(length=24), nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("failure_code", sa.String(length=64)),
        sa.Column("terminal_event_sequence", sa.Integer()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["analysis_id"],
            ["analyses.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "analysis_id",
            "stage",
            name="uq_analysis_stage_runs_analysis_stage",
        ),
    )
    op.create_index(
        "ix_analysis_stage_runs_analysis_id",
        "analysis_stage_runs",
        ["analysis_id"],
    )

    op.create_table(
        "model_invocations",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("analysis_id", sa.String(length=36), nullable=False),
        sa.Column("stage", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("prompt_version", sa.String(length=64), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("error_code", sa.String(length=64)),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("duration_ms", sa.Integer()),
        sa.Column("key_version", sa.Integer(), nullable=False),
        sa.Column("nonce", sa.LargeBinary(length=12), nullable=False),
        sa.Column("ciphertext", sa.LargeBinary(), nullable=False),
        sa.ForeignKeyConstraint(
            ["analysis_id"],
            ["analyses.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_model_invocations_analysis_id",
        "model_invocations",
        ["analysis_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_model_invocations_analysis_id",
        table_name="model_invocations",
    )
    op.drop_table("model_invocations")
    op.drop_index(
        "ix_analysis_stage_runs_analysis_id",
        table_name="analysis_stage_runs",
    )
    op.drop_table("analysis_stage_runs")

    with op.batch_alter_table("analysis_events") as batch_op:
        batch_op.drop_column("attempt")
        batch_op.drop_column("generation")

    with op.batch_alter_table("analyses") as batch_op:
        batch_op.drop_constraint(
            "uq_analyses_video_id",
            type_="unique",
        )
        batch_op.drop_column("next_event_sequence")

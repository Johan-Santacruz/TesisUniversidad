"""Remove the real-data/ZDR consent gate: drop consents table and video columns.

Revision ID: 0003_remove_real_data_gate
Revises: 0002_real_analysis_pipeline
Create Date: 2026-08-05
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0003_remove_real_data_gate"
down_revision: str | None = "0002_real_analysis_pipeline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("videos") as batch_op:
        batch_op.drop_column("consent_id")
        batch_op.drop_column("data_kind")

    op.drop_index("ix_consents_user_id", table_name="consents")
    op.drop_table("consents")


def downgrade() -> None:
    op.create_table(
        "consents",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("consent_type", sa.String(length=32), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("key_version", sa.Integer(), nullable=False),
        sa.Column("nonce", sa.LargeBinary(length=12), nullable=False),
        sa.Column("ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.create_index("ix_consents_user_id", "consents", ["user_id"])

    with op.batch_alter_table("videos") as batch_op:
        batch_op.add_column(
            sa.Column(
                "data_kind",
                sa.String(length=20),
                nullable=False,
                server_default="fictitious",
            )
        )
        batch_op.add_column(sa.Column("consent_id", sa.String(length=36)))
        batch_op.create_foreign_key(
            "fk_videos_consent_id_consents",
            "consents",
            ["consent_id"],
            ["id"],
        )

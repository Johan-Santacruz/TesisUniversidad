"""Track whether a case's routes were rebuilt with confirmed signals.

Revision ID: 0005_route_rebuild
Revises: 0004_memory_image_closing
Create Date: 2026-09-13
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0005_route_rebuild"
down_revision: str | None = "0004_memory_image_closing"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "cases",
        sa.Column(
            "routes_status",
            sa.String(length=24),
            nullable=False,
            server_default="initial",
        ),
    )


def downgrade() -> None:
    op.drop_column("cases", "routes_status")

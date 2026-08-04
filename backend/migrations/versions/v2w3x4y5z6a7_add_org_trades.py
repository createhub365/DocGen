"""Add org_trades table for org-scoped Trade Bank.

Additive only — new table. No changes to existing tables.

Revision ID: v2w3x4y5z6a7
Revises: u1v2w3x4y5z6
Create Date: 2026-08-04 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "v2w3x4y5z6a7"
down_revision: Union[str, Sequence[str], None] = "u1v2w3x4y5z6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(bind, table: str) -> bool:
    return table in set(inspect(bind).get_table_names())


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "org_trades"):
        return

    op.create_table(
        "org_trades",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("org_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("duties_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.UniqueConstraint("org_id", "name", name="uq_org_trades_org_name"),
    )
    op.create_index("ix_org_trades_org_id", "org_trades", ["org_id"])
    op.create_index("ix_org_trades_id", "org_trades", ["id"])


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "org_trades"):
        return
    op.drop_index("ix_org_trades_id", table_name="org_trades")
    op.drop_index("ix_org_trades_org_id", table_name="org_trades")
    op.drop_table("org_trades")

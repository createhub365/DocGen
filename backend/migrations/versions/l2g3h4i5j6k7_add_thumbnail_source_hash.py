"""add templates.thumbnail_source_hash for change detection

Revision ID: l2g3h4i5j6k7
Revises: k1f2a3b4c5d6
Create Date: 2026-07-28 15:50:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "l2g3h4i5j6k7"
down_revision: Union[str, Sequence[str], None] = "k1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(bind, table: str) -> bool:
    return table in set(inspect(bind).get_table_names())


def _has_column(bind, table: str, column: str) -> bool:
    if not _has_table(bind, table):
        return False
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "templates") and not _has_column(
        bind, "templates", "thumbnail_source_hash"
    ):
        op.add_column(
            "templates",
            sa.Column("thumbnail_source_hash", sa.String(length=64), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "templates") and _has_column(
        bind, "templates", "thumbnail_source_hash"
    ):
        op.drop_column("templates", "thumbnail_source_hash")

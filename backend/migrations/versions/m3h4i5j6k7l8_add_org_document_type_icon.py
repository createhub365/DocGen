"""add org_document_types.icon for dashboard card icons

Revision ID: m3h4i5j6k7l8
Revises: l2g3h4i5j6k7
Create Date: 2026-07-28 16:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "m3h4i5j6k7l8"
down_revision: Union[str, Sequence[str], None] = "l2g3h4i5j6k7"
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
    if _has_table(bind, "org_document_types") and not _has_column(
        bind, "org_document_types", "icon"
    ):
        op.add_column(
            "org_document_types",
            sa.Column("icon", sa.String(length=64), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "org_document_types") and _has_column(
        bind, "org_document_types", "icon"
    ):
        op.drop_column("org_document_types", "icon")

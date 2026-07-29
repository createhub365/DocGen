"""add templates.preview_pdf_path for cached full-preview PDF

Revision ID: n4i5j6k7l8m9
Revises: m3h4i5j6k7l8
Create Date: 2026-07-29 14:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "n4i5j6k7l8m9"
down_revision: Union[str, Sequence[str], None] = "m3h4i5j6k7l8"
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
        bind, "templates", "preview_pdf_path"
    ):
        op.add_column(
            "templates",
            sa.Column("preview_pdf_path", sa.String(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "templates") and _has_column(
        bind, "templates", "preview_pdf_path"
    ):
        op.drop_column("templates", "preview_pdf_path")

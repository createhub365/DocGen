"""add thumbnail to templates

Revision ID: a1b2c3d4e5f6
Revises: 07f122631fd6
Create Date: 2026-07-04 22:55:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "07f122631fd6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("templates", sa.Column("thumbnail_path", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("templates", "thumbnail_path")

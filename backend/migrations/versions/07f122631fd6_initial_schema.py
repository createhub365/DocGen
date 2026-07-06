"""initial_schema

Revision ID: 07f122631fd6
Revises:
Create Date: 2026-07-04 16:08:49.300463

Baseline migration for existing DocGen Pro SQLite schema.
Tables are created via SQLAlchemy models / seed on fresh installs.
"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = '07f122631fd6'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Baseline — schema already exists on upgraded installations."""
    pass


def downgrade() -> None:
    pass

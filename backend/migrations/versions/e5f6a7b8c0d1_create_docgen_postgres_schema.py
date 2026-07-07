"""create docgen base schema for postgres

Revision ID: e5f6a7b8c0d1
Revises: d4e5f6a7b8c9
Create Date: 2026-07-07 13:00:00.000000

Creates all DocGen tables on fresh PostgreSQL/Supabase installs.
Uses checkfirst so existing SQLite/Postgres installs are unaffected.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "e5f6a7b8c0d1"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from database import Base
    import models  # noqa: F401

    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        Base.metadata.create_all(bind=bind, checkfirst=True)


def downgrade() -> None:
    pass

"""add user email and platform sentinel flags

Revision ID: h8c9d0e1f2a3
Revises: g7b8c9d0e1f2
Create Date: 2026-07-24 16:40:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision: str = "h8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "g7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(bind, table: str, column: str) -> bool:
    if table not in set(inspect(bind).get_table_names()):
        return False
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_column(bind, "users", "email"):
        op.add_column("users", sa.Column("email", sa.String(), nullable=True))
        op.create_index("ix_users_email", "users", ["email"], unique=False)

    for table in ("countries", "trades", "companies", "document_types"):
        if not _has_column(bind, table, "is_platform_sentinel"):
            op.add_column(
                table,
                sa.Column(
                    "is_platform_sentinel",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.false(),
                ),
            )

    # Backfill sentinel flags from existing string markers
    bind.execute(
        text("UPDATE countries SET is_platform_sentinel = true WHERE code = '__PF__'")
    )
    bind.execute(
        text(
            "UPDATE trades SET is_platform_sentinel = true WHERE name = '__platform__'"
        )
    )
    bind.execute(
        text(
            "UPDATE companies SET is_platform_sentinel = true WHERE name = '__platform__'"
        )
    )
    bind.execute(
        text(
            "UPDATE document_types SET is_platform_sentinel = true WHERE slug = '__platform__'"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    for table in ("document_types", "companies", "trades", "countries"):
        if _has_column(bind, table, "is_platform_sentinel"):
            op.drop_column(table, "is_platform_sentinel")
    if _has_column(bind, "users", "email"):
        op.drop_index("ix_users_email", table_name="users")
        op.drop_column("users", "email")

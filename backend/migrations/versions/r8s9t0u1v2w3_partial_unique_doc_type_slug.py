"""partial unique index on active org_document_types (org_id, slug)

Allows slug reuse after soft-delete (is_active=false). Replaces the
blanket UniqueConstraint uq_org_document_types_org_slug.

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-07-29 23:15:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "r8s9t0u1v2w3"
down_revision: Union[str, Sequence[str], None] = "q7r8s9t0u1v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_OLD_CONSTRAINT = "uq_org_document_types_org_slug"
_NEW_INDEX = "uq_org_document_types_org_slug_active"
_TABLE = "org_document_types"


def _has_table(bind, table: str) -> bool:
    return table in set(inspect(bind).get_table_names())


def _has_index(bind, table: str, index: str) -> bool:
    if not _has_table(bind, table):
        return False
    return index in {i["name"] for i in inspect(bind).get_indexes(table)}


def _has_unique_constraint(bind, table: str, name: str) -> bool:
    if not _has_table(bind, table):
        return False
    return name in {c["name"] for c in inspect(bind).get_unique_constraints(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, _TABLE):
        return

    if _has_unique_constraint(bind, _TABLE, _OLD_CONSTRAINT):
        op.drop_constraint(_OLD_CONSTRAINT, _TABLE, type_="unique")
    elif _has_index(bind, _TABLE, _OLD_CONSTRAINT):
        # Some dialects materialize UNIQUE as an index with the constraint name.
        op.drop_index(_OLD_CONSTRAINT, table_name=_TABLE)

    if not _has_index(bind, _TABLE, _NEW_INDEX):
        op.create_index(
            _NEW_INDEX,
            _TABLE,
            ["org_id", "slug"],
            unique=True,
            sqlite_where=sa.text("is_active = 1"),
            postgresql_where=sa.text("is_active IS TRUE"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, _TABLE):
        return

    if _has_index(bind, _TABLE, _NEW_INDEX):
        op.drop_index(_NEW_INDEX, table_name=_TABLE)

    if not _has_unique_constraint(bind, _TABLE, _OLD_CONSTRAINT) and not _has_index(
        bind, _TABLE, _OLD_CONSTRAINT
    ):
        op.create_unique_constraint(
            _OLD_CONSTRAINT,
            _TABLE,
            ["org_id", "slug"],
        )

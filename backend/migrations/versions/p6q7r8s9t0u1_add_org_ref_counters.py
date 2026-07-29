"""add org_ref_counters and field_definitions auto-ref columns

Revision ID: p6q7r8s9t0u1
Revises: o5j6k7l8m9n0
Create Date: 2026-07-29 18:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "p6q7r8s9t0u1"
down_revision: Union[str, Sequence[str], None] = "o5j6k7l8m9n0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(bind, table: str) -> bool:
    return table in set(inspect(bind).get_table_names())


def _has_column(bind, table: str, column: str) -> bool:
    if not _has_table(bind, table):
        return False
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def _has_index(bind, table: str, index: str) -> bool:
    if not _has_table(bind, table):
        return False
    return index in {i["name"] for i in inspect(bind).get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_column(bind, "field_definitions", "is_auto_generated"):
        op.add_column(
            "field_definitions",
            sa.Column(
                "is_auto_generated",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )
    if not _has_column(bind, "field_definitions", "auto_config_json"):
        op.add_column(
            "field_definitions",
            sa.Column("auto_config_json", sa.JSON(), nullable=True),
        )

    if not _has_table(bind, "org_ref_counters"):
        op.create_table(
            "org_ref_counters",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("org_id", sa.String(length=36), nullable=False),
            sa.Column("document_type_id", sa.Integer(), nullable=False),
            sa.Column("year", sa.Integer(), nullable=False),
            sa.Column("last_sequence", sa.Integer(), nullable=False, server_default="0"),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
            sa.ForeignKeyConstraint(["document_type_id"], ["org_document_types.id"]),
            sa.UniqueConstraint(
                "org_id",
                "document_type_id",
                "year",
                name="uq_org_ref_counters_org_type_year",
            ),
        )
    if not _has_index(bind, "org_ref_counters", "ix_org_ref_counters_org_id"):
        op.create_index(
            "ix_org_ref_counters_org_id", "org_ref_counters", ["org_id"]
        )
    if not _has_index(bind, "org_ref_counters", "ix_org_ref_counters_document_type_id"):
        op.create_index(
            "ix_org_ref_counters_document_type_id",
            "org_ref_counters",
            ["document_type_id"],
        )
    if not _has_index(bind, "org_ref_counters", "ix_org_ref_counters_id"):
        op.create_index("ix_org_ref_counters_id", "org_ref_counters", ["id"])


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "org_ref_counters"):
        op.drop_table("org_ref_counters")
    if _has_column(bind, "field_definitions", "auto_config_json"):
        op.drop_column("field_definitions", "auto_config_json")
    if _has_column(bind, "field_definitions", "is_auto_generated"):
        op.drop_column("field_definitions", "is_auto_generated")

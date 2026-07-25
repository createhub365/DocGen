"""add org option lists and field_definitions.option_list_id

Revision ID: i9d0e1f2a3b4
Revises: h8c9d0e1f2a3
Create Date: 2026-07-24 17:15:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "i9d0e1f2a3b4"
down_revision: Union[str, Sequence[str], None] = "h8c9d0e1f2a3"
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

    if not _has_table(bind, "org_option_lists"):
        op.create_table(
            "org_option_lists",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("org_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("slug", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
            sa.UniqueConstraint("org_id", "slug", name="uq_org_option_lists_org_slug"),
        )
        op.create_index("ix_org_option_lists_org_id", "org_option_lists", ["org_id"])
        op.create_index("ix_org_option_lists_id", "org_option_lists", ["id"])

    if not _has_table(bind, "org_option_list_items"):
        op.create_table(
            "org_option_list_items",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("list_id", sa.Integer(), nullable=False),
            sa.Column("value", sa.String(), nullable=False),
            sa.Column("label", sa.String(), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.ForeignKeyConstraint(["list_id"], ["org_option_lists.id"]),
            sa.UniqueConstraint(
                "list_id", "value", name="uq_org_option_list_items_list_value"
            ),
        )
        op.create_index(
            "ix_org_option_list_items_list_id", "org_option_list_items", ["list_id"]
        )
        op.create_index("ix_org_option_list_items_id", "org_option_list_items", ["id"])

    if _has_table(bind, "field_definitions") and not _has_column(
        bind, "field_definitions", "option_list_id"
    ):
        op.add_column(
            "field_definitions",
            sa.Column("option_list_id", sa.Integer(), nullable=True),
        )
        op.create_foreign_key(
            "fk_field_definitions_option_list_id",
            "field_definitions",
            "org_option_lists",
            ["option_list_id"],
            ["id"],
        )
        op.create_index(
            "ix_field_definitions_option_list_id",
            "field_definitions",
            ["option_list_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind, "field_definitions", "option_list_id"):
        op.drop_index(
            "ix_field_definitions_option_list_id", table_name="field_definitions"
        )
        op.drop_constraint(
            "fk_field_definitions_option_list_id",
            "field_definitions",
            type_="foreignkey",
        )
        op.drop_column("field_definitions", "option_list_id")
    if _has_table(bind, "org_option_list_items"):
        op.drop_table("org_option_list_items")
    if _has_table(bind, "org_option_lists"):
        op.drop_table("org_option_lists")

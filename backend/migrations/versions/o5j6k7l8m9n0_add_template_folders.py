"""add template_folders and templates.folder_id

Revision ID: o5j6k7l8m9n0
Revises: n4i5j6k7l8m9
Create Date: 2026-07-29 15:45:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "o5j6k7l8m9n0"
down_revision: Union[str, Sequence[str], None] = "n4i5j6k7l8m9"
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

    if not _has_table(bind, "template_folders"):
        op.create_table(
            "template_folders",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("org_id", sa.String(length=36), nullable=False),
            sa.Column("org_document_type_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
            sa.ForeignKeyConstraint(
                ["org_document_type_id"], ["org_document_types.id"]
            ),
            sa.UniqueConstraint(
                "org_document_type_id",
                "name",
                name="uq_template_folders_type_name",
            ),
        )
        op.create_index(
            "ix_template_folders_org_id", "template_folders", ["org_id"]
        )
        op.create_index(
            "ix_template_folders_org_document_type_id",
            "template_folders",
            ["org_document_type_id"],
        )
        op.create_index("ix_template_folders_id", "template_folders", ["id"])

    if _has_table(bind, "templates") and not _has_column(
        bind, "templates", "folder_id"
    ):
        op.add_column(
            "templates",
            sa.Column("folder_id", sa.Integer(), nullable=True),
        )
        op.create_foreign_key(
            "fk_templates_folder_id_template_folders",
            "templates",
            "template_folders",
            ["folder_id"],
            ["id"],
            ondelete="SET NULL",
        )
        if not _has_index(bind, "templates", "ix_templates_folder_id"):
            op.create_index(
                "ix_templates_folder_id", "templates", ["folder_id"]
            )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "templates") and _has_column(bind, "templates", "folder_id"):
        if _has_index(bind, "templates", "ix_templates_folder_id"):
            op.drop_index("ix_templates_folder_id", table_name="templates")
        op.drop_constraint(
            "fk_templates_folder_id_template_folders",
            "templates",
            type_="foreignkey",
        )
        op.drop_column("templates", "folder_id")

    if _has_table(bind, "template_folders"):
        op.drop_table("template_folders")

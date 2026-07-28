"""generated_documents.template_id nullable + ON DELETE SET NULL

Revision ID: k1f2a3b4c5d6
Revises: j0e1f2a3b4c5
Create Date: 2026-07-28 10:40:00.000000

Allows deleting a Template without destroying historical GeneratedDocument
rows. Existing downloads keep working; template_id is cleared to NULL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "k1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "j0e1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(bind, table: str) -> bool:
    return table in set(inspect(bind).get_table_names())


def _fks(bind, table: str) -> list[dict]:
    if not _has_table(bind, table):
        return []
    return list(inspect(bind).get_foreign_keys(table))


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "generated_documents"):
        return

    # Drop any FK from generated_documents.template_id → templates.id
    for fk in _fks(bind, "generated_documents"):
        referred = fk.get("referred_table")
        cols = fk.get("constrained_columns") or []
        if referred == "templates" and "template_id" in cols:
            op.drop_constraint(fk["name"], "generated_documents", type_="foreignkey")

    op.alter_column(
        "generated_documents",
        "template_id",
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.create_foreign_key(
        "fk_generated_documents_template_id_templates",
        "generated_documents",
        "templates",
        ["template_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "generated_documents"):
        return

    for fk in _fks(bind, "generated_documents"):
        referred = fk.get("referred_table")
        cols = fk.get("constrained_columns") or []
        if referred == "templates" and "template_id" in cols:
            op.drop_constraint(fk["name"], "generated_documents", type_="foreignkey")

    # Restore NOT NULL only when safe. If any row was orphaned via template
    # delete (template_id IS NULL), forcing NOT NULL would fail — leave nullable
    # and recreate a plain FK without ON DELETE SET NULL.
    null_count = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM generated_documents WHERE template_id IS NULL"
        )
    ).scalar()
    if not null_count:
        op.alter_column(
            "generated_documents",
            "template_id",
            existing_type=sa.Integer(),
            nullable=False,
        )

    op.create_foreign_key(
        "fk_generated_documents_template_id_templates",
        "generated_documents",
        "templates",
        ["template_id"],
        ["id"],
    )

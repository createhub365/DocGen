"""add audit_logs table

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c0d1e2
Create Date: 2026-07-16 17:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "g7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())
    indexes = (
        {
            i["name"]
            for i in inspect(bind).get_indexes("audit_logs")
            if i.get("name")
        }
        if "audit_logs" in tables
        else set()
    )

    if "audit_logs" not in tables:
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("org_id", sa.String(length=36), nullable=False),
            sa.Column("actor_user_id", sa.Integer(), nullable=True),
            sa.Column("action", sa.String(), nullable=False),
            sa.Column("target_type", sa.String(), nullable=False),
            sa.Column("target_id", sa.String(), nullable=False),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if "ix_audit_logs_id" not in indexes:
        op.create_index("ix_audit_logs_id", "audit_logs", ["id"], unique=False)
    if "ix_audit_logs_org_id" not in indexes:
        op.create_index("ix_audit_logs_org_id", "audit_logs", ["org_id"], unique=False)
    if "ix_audit_logs_org_id_created_at" not in indexes:
        op.create_index(
            "ix_audit_logs_org_id_created_at",
            "audit_logs",
            ["org_id", "created_at"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())
    if "audit_logs" not in tables:
        return
    indexes = {
        i["name"]
        for i in inspect(bind).get_indexes("audit_logs")
        if i.get("name")
    }
    if "ix_audit_logs_org_id_created_at" in indexes:
        op.drop_index("ix_audit_logs_org_id_created_at", table_name="audit_logs")
    if "ix_audit_logs_org_id" in indexes:
        op.drop_index("ix_audit_logs_org_id", table_name="audit_logs")
    if "ix_audit_logs_id" in indexes:
        op.drop_index("ix_audit_logs_id", table_name="audit_logs")
    op.drop_table("audit_logs")

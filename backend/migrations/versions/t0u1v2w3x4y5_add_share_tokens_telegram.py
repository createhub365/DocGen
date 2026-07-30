"""add document_share_tokens and telegram_contacts

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
Create Date: 2026-07-30 15:40:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "t0u1v2w3x4y5"
down_revision: Union[str, Sequence[str], None] = "s9t0u1v2w3x4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(bind, table: str) -> bool:
    return table in set(inspect(bind).get_table_names())


def _has_index(bind, table: str, name: str) -> bool:
    if not _has_table(bind, table):
        return False
    return name in {i["name"] for i in inspect(bind).get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "document_share_tokens"):
        op.create_table(
            "document_share_tokens",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("generated_document_id", sa.Integer(), nullable=False),
            sa.Column("org_id", sa.String(length=36), nullable=False),
            sa.Column("token", sa.String(length=64), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("created_by", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(
                ["generated_document_id"],
                ["generated_documents.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _has_index(bind, "document_share_tokens", "ix_document_share_tokens_id"):
        op.create_index(
            "ix_document_share_tokens_id",
            "document_share_tokens",
            ["id"],
            unique=False,
        )
    if not _has_index(bind, "document_share_tokens", "ix_document_share_tokens_org_id"):
        op.create_index(
            "ix_document_share_tokens_org_id",
            "document_share_tokens",
            ["org_id"],
            unique=False,
        )
    if not _has_index(bind, "document_share_tokens", "ix_document_share_tokens_token"):
        op.create_index(
            "ix_document_share_tokens_token",
            "document_share_tokens",
            ["token"],
            unique=True,
        )
    if not _has_index(
        bind, "document_share_tokens", "ix_document_share_tokens_generated_document_id"
    ):
        op.create_index(
            "ix_document_share_tokens_generated_document_id",
            "document_share_tokens",
            ["generated_document_id"],
            unique=False,
        )

    if not _has_table(bind, "telegram_contacts"):
        op.create_table(
            "telegram_contacts",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("org_id", sa.String(length=36), nullable=False),
            sa.Column("label", sa.String(length=255), nullable=False),
            sa.Column("chat_id", sa.String(length=64), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "org_id", "chat_id", name="uq_telegram_contacts_org_chat"
            ),
        )

    if not _has_index(bind, "telegram_contacts", "ix_telegram_contacts_id"):
        op.create_index(
            "ix_telegram_contacts_id",
            "telegram_contacts",
            ["id"],
            unique=False,
        )
    if not _has_index(bind, "telegram_contacts", "ix_telegram_contacts_org_id"):
        op.create_index(
            "ix_telegram_contacts_org_id",
            "telegram_contacts",
            ["org_id"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "telegram_contacts"):
        op.drop_table("telegram_contacts")
    if _has_table(bind, "document_share_tokens"):
        op.drop_table("document_share_tokens")

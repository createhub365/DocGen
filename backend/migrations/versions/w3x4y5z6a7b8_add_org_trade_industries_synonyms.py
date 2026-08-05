"""Add org_trade_industries + OrgTrade.industry_id/synonyms.

Additive only — new table + nullable FK + JSON synonyms column.

Revision ID: w3x4y5z6a7b8
Revises: v2w3x4y5z6a7
Create Date: 2026-08-05 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "w3x4y5z6a7b8"
down_revision: Union[str, Sequence[str], None] = "v2w3x4y5z6a7"
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

    if not _has_table(bind, "org_trade_industries"):
        op.create_table(
            "org_trade_industries",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("org_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
            sa.UniqueConstraint(
                "org_id", "name", name="uq_org_trade_industries_org_name"
            ),
        )
        op.create_index(
            "ix_org_trade_industries_org_id",
            "org_trade_industries",
            ["org_id"],
        )
        op.create_index(
            "ix_org_trade_industries_id",
            "org_trade_industries",
            ["id"],
        )

    if _has_table(bind, "org_trades") and not _has_column(
        bind, "org_trades", "industry_id"
    ):
        op.add_column(
            "org_trades",
            sa.Column("industry_id", sa.Integer(), nullable=True),
        )
        op.create_foreign_key(
            "fk_org_trades_industry_id",
            "org_trades",
            "org_trade_industries",
            ["industry_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index(
            "ix_org_trades_industry_id",
            "org_trades",
            ["industry_id"],
        )

    if _has_table(bind, "org_trades") and not _has_column(
        bind, "org_trades", "synonyms"
    ):
        op.add_column(
            "org_trades",
            sa.Column("synonyms", sa.JSON(), nullable=False, server_default="[]"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "org_trades"):
        if _has_column(bind, "org_trades", "synonyms"):
            op.drop_column("org_trades", "synonyms")
        if _has_column(bind, "org_trades", "industry_id"):
            op.drop_index("ix_org_trades_industry_id", table_name="org_trades")
            op.drop_constraint(
                "fk_org_trades_industry_id", "org_trades", type_="foreignkey"
            )
            op.drop_column("org_trades", "industry_id")
    if _has_table(bind, "org_trade_industries"):
        op.drop_index(
            "ix_org_trade_industries_id", table_name="org_trade_industries"
        )
        op.drop_index(
            "ix_org_trade_industries_org_id", table_name="org_trade_industries"
        )
        op.drop_table("org_trade_industries")

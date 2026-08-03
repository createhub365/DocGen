"""Add FlowConfig.template_id for per-template flow ownership (Phase A).

Additive only: document_type_id becomes nullable; exactly one of
document_type_id / template_id must be set. Existing doc-type flows unchanged.

Revision ID: u1v2w3x4y5z6
Revises: t0u1v2w3x4y5
Create Date: 2026-08-03 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision: str = "u1v2w3x4y5z6"
down_revision: Union[str, Sequence[str], None] = "t0u1v2w3x4y5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "flow_configs"


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


def _has_unique_constraint(bind, table: str, name: str) -> bool:
    if not _has_table(bind, table):
        return False
    return name in {c["name"] for c in inspect(bind).get_unique_constraints(table)}


def _has_check(bind, table: str, name: str) -> bool:
    if not _has_table(bind, table):
        return False
    # SQLite / Postgres inspect support varies; best-effort.
    try:
        return name in {c["name"] for c in inspect(bind).get_check_constraints(table)}
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, _TABLE):
        return

    if not _has_column(bind, _TABLE, "template_id"):
        op.add_column(
            _TABLE,
            sa.Column(
                "template_id",
                sa.Integer(),
                sa.ForeignKey("templates.id"),
                nullable=True,
            ),
        )

    # Allow per-template flows (document_type_id NULL).
    # Batch mode / SQLite: use batch_alter_table for nullability when needed.
    dialect = bind.dialect.name
    if dialect == "sqlite":
        with op.batch_alter_table(_TABLE) as batch:
            batch.alter_column(
                "document_type_id",
                existing_type=sa.Integer(),
                nullable=True,
            )
    else:
        op.alter_column(
            _TABLE,
            "document_type_id",
            existing_type=sa.Integer(),
            nullable=True,
        )

    if not _has_index(bind, _TABLE, "ix_flow_configs_template_id"):
        op.create_index(
            "ix_flow_configs_template_id",
            _TABLE,
            ["template_id"],
        )

    # Unique (template_id, version) when template_id is set.
    if not _has_index(bind, _TABLE, "uq_flow_configs_template_version"):
        op.create_index(
            "uq_flow_configs_template_version",
            _TABLE,
            ["template_id", "version"],
            unique=True,
            sqlite_where=sa.text("template_id IS NOT NULL"),
            postgresql_where=sa.text("template_id IS NOT NULL"),
        )

    # At most one published flow per template.
    if not _has_index(bind, _TABLE, "uq_flow_configs_one_published_template"):
        op.create_index(
            "uq_flow_configs_one_published_template",
            _TABLE,
            ["template_id"],
            unique=True,
            sqlite_where=sa.text("is_published = 1 AND template_id IS NOT NULL"),
            postgresql_where=sa.text(
                "is_published IS TRUE AND template_id IS NOT NULL"
            ),
        )

    # XOR owner: exactly one of document_type_id / template_id.
    if not _has_check(bind, _TABLE, "ck_flow_configs_owner_xor"):
        if dialect == "sqlite":
            # SQLite CHECK added via batch; existing rows all have document_type_id.
            with op.batch_alter_table(_TABLE) as batch:
                batch.create_check_constraint(
                    "ck_flow_configs_owner_xor",
                    "(document_type_id IS NOT NULL AND template_id IS NULL) OR "
                    "(document_type_id IS NULL AND template_id IS NOT NULL)",
                )
        else:
            op.create_check_constraint(
                "ck_flow_configs_owner_xor",
                _TABLE,
                "(document_type_id IS NOT NULL AND template_id IS NULL) OR "
                "(document_type_id IS NULL AND template_id IS NOT NULL)",
            )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, _TABLE):
        return

    dialect = bind.dialect.name

    # Cannot downgrade if any template-owned rows exist.
    if _has_column(bind, _TABLE, "template_id"):
        count = bind.execute(
            text("SELECT COUNT(*) FROM flow_configs WHERE template_id IS NOT NULL")
        ).scalar()
        if int(count or 0) > 0:
            raise RuntimeError(
                "Cannot downgrade u1v2w3x4y5z6 while template-owned flows exist"
            )

    if _has_check(bind, _TABLE, "ck_flow_configs_owner_xor"):
        if dialect == "sqlite":
            with op.batch_alter_table(_TABLE) as batch:
                batch.drop_constraint("ck_flow_configs_owner_xor", type_="check")
        else:
            op.drop_constraint("ck_flow_configs_owner_xor", _TABLE, type_="check")

    if _has_index(bind, _TABLE, "uq_flow_configs_one_published_template"):
        op.drop_index("uq_flow_configs_one_published_template", table_name=_TABLE)
    if _has_index(bind, _TABLE, "uq_flow_configs_template_version"):
        op.drop_index("uq_flow_configs_template_version", table_name=_TABLE)
    if _has_index(bind, _TABLE, "ix_flow_configs_template_id"):
        op.drop_index("ix_flow_configs_template_id", table_name=_TABLE)

    if dialect == "sqlite":
        with op.batch_alter_table(_TABLE) as batch:
            batch.alter_column(
                "document_type_id",
                existing_type=sa.Integer(),
                nullable=False,
            )
            if _has_column(bind, _TABLE, "template_id"):
                batch.drop_column("template_id")
    else:
        op.alter_column(
            _TABLE,
            "document_type_id",
            existing_type=sa.Integer(),
            nullable=False,
        )
        if _has_column(bind, _TABLE, "template_id"):
            op.drop_column(_TABLE, "template_id")

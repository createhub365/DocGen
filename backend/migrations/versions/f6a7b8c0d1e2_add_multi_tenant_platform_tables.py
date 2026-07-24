"""add multi-tenant platform tables

Revision ID: f6a7b8c0d1e2
Revises: e5f6a7b8c0d1
Create Date: 2026-07-16 16:15:00.000000

Phase 1 data layer: organizations, org membership, org document types,
flow configs/steps, field definitions, placeholder mappings, and nullable
org FKs on templates / generated_documents.

SQLite cannot ALTER-add FK constraints (and batch recreate of templates
fails while generated_documents still references it), so on SQLite we add
nullable columns + indexes only. PostgreSQL gets full FK constraints.
ORM models still declare the FKs for both dialects.

Upgrade is idempotent so a partially-applied run can be completed safely.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "f6a7b8c0d1e2"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tables(bind) -> set[str]:
    return set(inspect(bind).get_table_names())


def _columns(bind, table: str) -> set[str]:
    return {c["name"] for c in inspect(bind).get_columns(table)}


def _indexes(bind, table: str) -> set[str]:
    return {i["name"] for i in inspect(bind).get_indexes(table) if i.get("name")}


def _fks(bind, table: str) -> set[str]:
    return {
        fk["name"]
        for fk in inspect(bind).get_foreign_keys(table)
        if fk.get("name")
    }


def upgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"
    existing = _tables(bind)

    if "organizations" not in existing:
        op.create_table(
            "organizations",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("slug", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
    if "ix_organizations_slug" not in _indexes(bind, "organizations"):
        op.create_index(
            "ix_organizations_slug", "organizations", ["slug"], unique=True
        )

    if "org_users" not in existing:
        op.create_table(
            "org_users",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("org_id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("role", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", name="uq_org_users_user_id"),
            sa.UniqueConstraint("org_id", "user_id", name="uq_org_users_org_user"),
        )
    org_user_indexes = _indexes(bind, "org_users")
    if "ix_org_users_id" not in org_user_indexes:
        op.create_index("ix_org_users_id", "org_users", ["id"], unique=False)
    if "ix_org_users_org_id" not in org_user_indexes:
        op.create_index("ix_org_users_org_id", "org_users", ["org_id"], unique=False)

    existing = _tables(bind)
    if "org_document_types" not in existing:
        op.create_table(
            "org_document_types",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("org_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("slug", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("created_by", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "org_id", "slug", name="uq_org_document_types_org_slug"
            ),
        )
    odt_indexes = _indexes(bind, "org_document_types")
    if "ix_org_document_types_id" not in odt_indexes:
        op.create_index(
            "ix_org_document_types_id", "org_document_types", ["id"], unique=False
        )
    if "ix_org_document_types_org_id" not in odt_indexes:
        op.create_index(
            "ix_org_document_types_org_id",
            "org_document_types",
            ["org_id"],
            unique=False,
        )

    existing = _tables(bind)
    if "flow_configs" not in existing:
        op.create_table(
            "flow_configs",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("document_type_id", sa.Integer(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("is_published", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["document_type_id"], ["org_document_types.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "document_type_id",
                "version",
                name="uq_flow_configs_document_type_version",
            ),
        )
    fc_indexes = _indexes(bind, "flow_configs")
    if "ix_flow_configs_id" not in fc_indexes:
        op.create_index("ix_flow_configs_id", "flow_configs", ["id"], unique=False)
    if "ix_flow_configs_document_type_id" not in fc_indexes:
        op.create_index(
            "ix_flow_configs_document_type_id",
            "flow_configs",
            ["document_type_id"],
            unique=False,
        )
    if "uq_flow_configs_one_published" not in fc_indexes:
        op.create_index(
            "uq_flow_configs_one_published",
            "flow_configs",
            ["document_type_id"],
            unique=True,
            sqlite_where=sa.text("is_published = 1"),
            postgresql_where=sa.text("is_published IS TRUE"),
        )

    existing = _tables(bind)
    if "flow_steps" not in existing:
        op.create_table(
            "flow_steps",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("flow_config_id", sa.Integer(), nullable=False),
            sa.Column("step_type", sa.String(), nullable=False),
            sa.Column("order_index", sa.Integer(), nullable=False),
            sa.Column("is_enabled", sa.Boolean(), nullable=False),
            sa.Column("label", sa.String(), nullable=False),
            sa.Column("config_json", sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(["flow_config_id"], ["flow_configs.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "flow_config_id",
                "order_index",
                name="uq_flow_steps_config_order",
            ),
        )
    fs_indexes = _indexes(bind, "flow_steps")
    if "ix_flow_steps_id" not in fs_indexes:
        op.create_index("ix_flow_steps_id", "flow_steps", ["id"], unique=False)
    if "ix_flow_steps_flow_config_id" not in fs_indexes:
        op.create_index(
            "ix_flow_steps_flow_config_id",
            "flow_steps",
            ["flow_config_id"],
            unique=False,
        )

    existing = _tables(bind)
    if "field_definitions" not in existing:
        op.create_table(
            "field_definitions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("flow_step_id", sa.Integer(), nullable=False),
            sa.Column("field_key", sa.String(), nullable=False),
            sa.Column("field_label", sa.String(), nullable=False),
            sa.Column("field_type", sa.String(), nullable=False),
            sa.Column("is_required", sa.Boolean(), nullable=False),
            sa.Column("options_json", sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(["flow_step_id"], ["flow_steps.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "flow_step_id",
                "field_key",
                name="uq_field_definitions_step_key",
            ),
        )
    fd_indexes = _indexes(bind, "field_definitions")
    if "ix_field_definitions_id" not in fd_indexes:
        op.create_index(
            "ix_field_definitions_id", "field_definitions", ["id"], unique=False
        )
    if "ix_field_definitions_flow_step_id" not in fd_indexes:
        op.create_index(
            "ix_field_definitions_flow_step_id",
            "field_definitions",
            ["flow_step_id"],
            unique=False,
        )

    tmpl_cols = _columns(bind, "templates")
    if "org_id" not in tmpl_cols:
        op.add_column(
            "templates", sa.Column("org_id", sa.String(length=36), nullable=True)
        )
    if "org_document_type_id" not in tmpl_cols:
        op.add_column(
            "templates",
            sa.Column("org_document_type_id", sa.Integer(), nullable=True),
        )
    tmpl_indexes = _indexes(bind, "templates")
    if "ix_templates_org_id" not in tmpl_indexes:
        op.create_index("ix_templates_org_id", "templates", ["org_id"], unique=False)
    if "ix_templates_org_document_type_id" not in tmpl_indexes:
        op.create_index(
            "ix_templates_org_document_type_id",
            "templates",
            ["org_document_type_id"],
            unique=False,
        )
    if not is_sqlite:
        tmpl_fks = _fks(bind, "templates")
        if "fk_templates_org_id_organizations" not in tmpl_fks:
            op.create_foreign_key(
                "fk_templates_org_id_organizations",
                "templates",
                "organizations",
                ["org_id"],
                ["id"],
            )
        if "fk_templates_org_document_type_id_org_document_types" not in tmpl_fks:
            op.create_foreign_key(
                "fk_templates_org_document_type_id_org_document_types",
                "templates",
                "org_document_types",
                ["org_document_type_id"],
                ["id"],
            )

    existing = _tables(bind)
    if "placeholder_mappings" not in existing:
        op.create_table(
            "placeholder_mappings",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("template_id", sa.Integer(), nullable=False),
            sa.Column("placeholder_key", sa.String(), nullable=False),
            sa.Column("field_key", sa.String(), nullable=False),
            sa.Column("is_mapped", sa.Boolean(), nullable=False),
            sa.ForeignKeyConstraint(["template_id"], ["templates.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "template_id",
                "placeholder_key",
                name="uq_placeholder_mappings_template_key",
            ),
        )
    pm_indexes = _indexes(bind, "placeholder_mappings")
    if "ix_placeholder_mappings_id" not in pm_indexes:
        op.create_index(
            "ix_placeholder_mappings_id",
            "placeholder_mappings",
            ["id"],
            unique=False,
        )
    if "ix_placeholder_mappings_template_id" not in pm_indexes:
        op.create_index(
            "ix_placeholder_mappings_template_id",
            "placeholder_mappings",
            ["template_id"],
            unique=False,
        )

    gd_cols = _columns(bind, "generated_documents")
    if "org_id" not in gd_cols:
        op.add_column(
            "generated_documents",
            sa.Column("org_id", sa.String(length=36), nullable=True),
        )
    gd_indexes = _indexes(bind, "generated_documents")
    if "ix_generated_documents_org_id" not in gd_indexes:
        op.create_index(
            "ix_generated_documents_org_id",
            "generated_documents",
            ["org_id"],
            unique=False,
        )
    if not is_sqlite:
        gd_fks = _fks(bind, "generated_documents")
        if "fk_generated_documents_org_id_organizations" not in gd_fks:
            op.create_foreign_key(
                "fk_generated_documents_org_id_organizations",
                "generated_documents",
                "organizations",
                ["org_id"],
                ["id"],
            )

    # Drop leftover batch temp tables from earlier failed attempts (SQLite).
    for tmp in (
        "_alembic_tmp_templates",
        "_alembic_tmp_generated_documents",
        "_alembic_tmp_users",
    ):
        if tmp in _tables(bind):
            op.drop_table(tmp)


def downgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == "sqlite"

    op.drop_index("ix_generated_documents_org_id", table_name="generated_documents")
    if not is_sqlite:
        op.drop_constraint(
            "fk_generated_documents_org_id_organizations",
            "generated_documents",
            type_="foreignkey",
        )
    op.drop_column("generated_documents", "org_id")

    op.drop_index(
        "ix_placeholder_mappings_template_id", table_name="placeholder_mappings"
    )
    op.drop_index("ix_placeholder_mappings_id", table_name="placeholder_mappings")
    op.drop_table("placeholder_mappings")

    op.drop_index("ix_templates_org_document_type_id", table_name="templates")
    op.drop_index("ix_templates_org_id", table_name="templates")
    if not is_sqlite:
        op.drop_constraint(
            "fk_templates_org_document_type_id_org_document_types",
            "templates",
            type_="foreignkey",
        )
        op.drop_constraint(
            "fk_templates_org_id_organizations",
            "templates",
            type_="foreignkey",
        )
    op.drop_column("templates", "org_document_type_id")
    op.drop_column("templates", "org_id")

    op.drop_index(
        "ix_field_definitions_flow_step_id", table_name="field_definitions"
    )
    op.drop_index("ix_field_definitions_id", table_name="field_definitions")
    op.drop_table("field_definitions")

    op.drop_index("ix_flow_steps_flow_config_id", table_name="flow_steps")
    op.drop_index("ix_flow_steps_id", table_name="flow_steps")
    op.drop_table("flow_steps")

    op.drop_index("uq_flow_configs_one_published", table_name="flow_configs")
    op.drop_index("ix_flow_configs_document_type_id", table_name="flow_configs")
    op.drop_index("ix_flow_configs_id", table_name="flow_configs")
    op.drop_table("flow_configs")

    op.drop_index("ix_org_document_types_org_id", table_name="org_document_types")
    op.drop_index("ix_org_document_types_id", table_name="org_document_types")
    op.drop_table("org_document_types")

    op.drop_index("ix_org_users_org_id", table_name="org_users")
    op.drop_index("ix_org_users_id", table_name="org_users")
    op.drop_table("org_users")

    op.drop_index("ix_organizations_slug", table_name="organizations")
    op.drop_table("organizations")

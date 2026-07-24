"""Multi-tenant platform models (Phase 1 — data layer only).

Runs in parallel with the legacy immigration catalog models in models.py.
Legacy DocumentType (table: document_types) is untouched; org-scoped types
live in org_document_types as OrgDocumentType.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship

from database import Base


class OrgUserRole(str, enum.Enum):
    org_admin = "org_admin"
    staff = "staff"


class FlowStepType(str, enum.Enum):
    text_field = "text_field"
    number_field = "number_field"
    date_field = "date_field"
    dropdown = "dropdown"
    party_selector = "party_selector"
    country_selector = "country_selector"
    custom_fields = "custom_fields"
    file_upload = "file_upload"
    rich_text = "rich_text"


class FieldDefinitionType(str, enum.Enum):
    text = "text"
    number = "number"
    date = "date"
    dropdown = "dropdown"


def _uuid_str() -> str:
    return str(uuid.uuid4())


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String(36), primary_key=True, default=_uuid_str)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    members = relationship("OrgUser", back_populates="organization")
    document_types = relationship("OrgDocumentType", back_populates="organization")


class OrgUser(Base):
    """Membership linking an existing User to exactly one Organization (Phase 1)."""

    __tablename__ = "org_users"
    __table_args__ = (
        # Single-org membership for this phase; multi-org membership later.
        UniqueConstraint("user_id", name="uq_org_users_user_id"),
        UniqueConstraint("org_id", "user_id", name="uq_org_users_org_user"),
        Index("ix_org_users_org_id", "org_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String, nullable=False, default=OrgUserRole.staff.value)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    organization = relationship("Organization", back_populates="members")
    user = relationship("User")


class OrgDocumentType(Base):
    """Org-scoped document type for the platform flow builder.

    Named OrgDocumentType / org_document_types to avoid colliding with the
    legacy DocumentType model (table: document_types) used by the immigration wizard.
    """

    __tablename__ = "org_document_types"
    __table_args__ = (
        UniqueConstraint("org_id", "slug", name="uq_org_document_types_org_slug"),
        Index("ix_org_document_types_org_id", "org_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    organization = relationship("Organization", back_populates="document_types")
    creator = relationship("User", foreign_keys=[created_by])
    flow_configs = relationship("FlowConfig", back_populates="document_type")


class FlowConfig(Base):
    __tablename__ = "flow_configs"
    __table_args__ = (
        UniqueConstraint(
            "document_type_id",
            "version",
            name="uq_flow_configs_document_type_version",
        ),
        # At most one published flow per document type (app + DB enforced).
        Index(
            "uq_flow_configs_one_published",
            "document_type_id",
            unique=True,
            sqlite_where=text("is_published = 1"),
            postgresql_where=text("is_published IS TRUE"),
        ),
        Index("ix_flow_configs_document_type_id", "document_type_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    document_type_id = Column(
        Integer, ForeignKey("org_document_types.id"), nullable=False
    )
    version = Column(Integer, nullable=False, default=1)
    is_published = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    document_type = relationship("OrgDocumentType", back_populates="flow_configs")
    steps = relationship(
        "FlowStep",
        back_populates="flow_config",
        order_by="FlowStep.order_index",
    )


class FlowStep(Base):
    __tablename__ = "flow_steps"
    __table_args__ = (
        UniqueConstraint(
            "flow_config_id",
            "order_index",
            name="uq_flow_steps_config_order",
        ),
        Index("ix_flow_steps_flow_config_id", "flow_config_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    flow_config_id = Column(Integer, ForeignKey("flow_configs.id"), nullable=False)
    step_type = Column(String, nullable=False)
    order_index = Column(Integer, nullable=False, default=0)
    is_enabled = Column(Boolean, default=True, nullable=False)
    label = Column(String, nullable=False)
    config_json = Column(JSON, nullable=True)

    flow_config = relationship("FlowConfig", back_populates="steps")
    field_definitions = relationship(
        "FieldDefinition",
        back_populates="flow_step",
    )


class FieldDefinition(Base):
    __tablename__ = "field_definitions"
    __table_args__ = (
        UniqueConstraint(
            "flow_step_id",
            "field_key",
            name="uq_field_definitions_step_key",
        ),
        Index("ix_field_definitions_flow_step_id", "flow_step_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    flow_step_id = Column(Integer, ForeignKey("flow_steps.id"), nullable=False)
    field_key = Column(String, nullable=False)
    field_label = Column(String, nullable=False)
    field_type = Column(String, nullable=False)
    is_required = Column(Boolean, default=False, nullable=False)
    options_json = Column(JSON, nullable=True)

    flow_step = relationship("FlowStep", back_populates="field_definitions")


class PlaceholderMapping(Base):
    __tablename__ = "placeholder_mappings"
    __table_args__ = (
        UniqueConstraint(
            "template_id",
            "placeholder_key",
            name="uq_placeholder_mappings_template_key",
        ),
        Index("ix_placeholder_mappings_template_id", "template_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=False)
    placeholder_key = Column(String, nullable=False)
    field_key = Column(String, nullable=False)
    is_mapped = Column(Boolean, default=False, nullable=False)

    template = relationship("Template", back_populates="placeholder_mappings")


class AuditLog(Base):
    """Append-only org-scoped audit trail for platform actions."""

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_org_id", "org_id"),
        Index("ix_audit_logs_org_id_created_at", "org_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)
    target_type = Column(String, nullable=False)
    target_id = Column(String, nullable=False)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    organization = relationship("Organization")
    actor = relationship("User", foreign_keys=[actor_user_id])

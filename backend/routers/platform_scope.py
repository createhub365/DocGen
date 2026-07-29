"""Shared org-scoping helpers for /api/platform routers (Phase 3)."""

from __future__ import annotations

import os
import re
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

import models

# Fixed outputs emitted by non-custom step types (mapping validation).
FIXED_STEP_OUTPUT_KEYS: dict[str, frozenset[str]] = {
    "country_selector": frozenset({"country.name", "country.code"}),
    "party_selector": frozenset({"party.name", "party.email", "party.address"}),
}

PLATFORM_LEGACY_DOC_TYPE_SLUG = "__platform__"
PLATFORM_LEGACY_COUNTRY_CODE = "__PF__"
PLATFORM_LEGACY_TRADE_NAME = "__platform__"
PLATFORM_LEGACY_COMPANY_NAME = "__platform__"


def is_platform_sentinel_country(country: models.Country) -> bool:
    return bool(getattr(country, "is_platform_sentinel", False)) or (
        country.code == PLATFORM_LEGACY_COUNTRY_CODE
    )


def is_platform_sentinel_trade(trade: models.Trade) -> bool:
    return bool(getattr(trade, "is_platform_sentinel", False)) or (
        trade.name == PLATFORM_LEGACY_TRADE_NAME
    )


def is_platform_sentinel_company(company: models.Company) -> bool:
    return bool(getattr(company, "is_platform_sentinel", False)) or (
        company.name == PLATFORM_LEGACY_COMPANY_NAME
    )


def is_platform_sentinel_document_type(doc_type: models.DocumentType) -> bool:
    return bool(getattr(doc_type, "is_platform_sentinel", False)) or (
        doc_type.slug == PLATFORM_LEGACY_DOC_TYPE_SLUG
    )

_SLUG_SAFE = re.compile(r"[^a-zA-Z0-9_-]+")


def get_org_membership(
    db: Session, org_user_id: int, org_id: str
) -> models.OrgUser:
    row = (
        db.query(models.OrgUser)
        .filter(
            models.OrgUser.id == org_user_id,
            models.OrgUser.org_id == org_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


def count_org_admins(db: Session, org_id: str) -> int:
    return (
        db.query(models.OrgUser)
        .filter(
            models.OrgUser.org_id == org_id,
            models.OrgUser.role == "org_admin",
        )
        .count()
    )


def get_org_document_type(
    db: Session, document_type_id: int, org_id: str
) -> models.OrgDocumentType:
    row = (
        db.query(models.OrgDocumentType)
        .filter(
            models.OrgDocumentType.id == document_type_id,
            models.OrgDocumentType.org_id == org_id,
            models.OrgDocumentType.is_active.is_(True),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


def get_org_flow_config(
    db: Session, flow_config_id: int, org_id: str
) -> models.FlowConfig:
    row = (
        db.query(models.FlowConfig)
        .join(
            models.OrgDocumentType,
            models.FlowConfig.document_type_id == models.OrgDocumentType.id,
        )
        .filter(
            models.FlowConfig.id == flow_config_id,
            models.OrgDocumentType.org_id == org_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


def get_org_flow_step(db: Session, step_id: int, org_id: str) -> models.FlowStep:
    row = (
        db.query(models.FlowStep)
        .join(
            models.FlowConfig,
            models.FlowStep.flow_config_id == models.FlowConfig.id,
        )
        .join(
            models.OrgDocumentType,
            models.FlowConfig.document_type_id == models.OrgDocumentType.id,
        )
        .filter(
            models.FlowStep.id == step_id,
            models.OrgDocumentType.org_id == org_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


def get_org_field_definition(
    db: Session, field_id: int, org_id: str
) -> models.FieldDefinition:
    row = (
        db.query(models.FieldDefinition)
        .join(
            models.FlowStep,
            models.FieldDefinition.flow_step_id == models.FlowStep.id,
        )
        .join(
            models.FlowConfig,
            models.FlowStep.flow_config_id == models.FlowConfig.id,
        )
        .join(
            models.OrgDocumentType,
            models.FlowConfig.document_type_id == models.OrgDocumentType.id,
        )
        .filter(
            models.FieldDefinition.id == field_id,
            models.OrgDocumentType.org_id == org_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


def get_org_option_list(
    db: Session, list_id: int, org_id: str
) -> models.OrgOptionList:
    row = (
        db.query(models.OrgOptionList)
        .filter(
            models.OrgOptionList.id == list_id,
            models.OrgOptionList.org_id == org_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


def get_org_template_folder(
    db: Session,
    folder_id: int,
    org_id: str,
    *,
    document_type_id: int | None = None,
) -> models.TemplateFolder:
    q = db.query(models.TemplateFolder).filter(
        models.TemplateFolder.id == folder_id,
        models.TemplateFolder.org_id == org_id,
    )
    if document_type_id is not None:
        q = q.filter(models.TemplateFolder.org_document_type_id == document_type_id)
    row = q.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


def get_org_option_list_item(
    db: Session, item_id: int, org_id: str
) -> models.OrgOptionListItem:
    row = (
        db.query(models.OrgOptionListItem)
        .join(
            models.OrgOptionList,
            models.OrgOptionListItem.list_id == models.OrgOptionList.id,
        )
        .filter(
            models.OrgOptionListItem.id == item_id,
            models.OrgOptionList.org_id == org_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


def resolve_field_effective_options(
    db: Session, field: models.FieldDefinition
) -> list | None:
    """
    List-wins: when option_list_id is set, return active list items;
    otherwise return inline options_json (may be None).
    """
    if field.option_list_id:
        items = (
            db.query(models.OrgOptionListItem)
            .filter(
                models.OrgOptionListItem.list_id == field.option_list_id,
                models.OrgOptionListItem.is_active.is_(True),
            )
            .order_by(
                models.OrgOptionListItem.sort_order.asc(),
                models.OrgOptionListItem.id.asc(),
            )
            .all()
        )
        return [{"value": i.value, "label": i.label} for i in items]
    if field.options_json is None:
        return None
    return field.options_json


def field_definition_read(
    db: Session, field: models.FieldDefinition
) -> "FieldDefinitionRead":
    from schemas_platform import FieldDefinitionRead

    return FieldDefinitionRead(
        id=field.id,
        flow_step_id=field.flow_step_id,
        field_key=field.field_key,
        field_label=field.field_label,
        field_type=field.field_type,
        is_required=field.is_required,
        options_json=field.options_json,
        option_list_id=field.option_list_id,
        is_auto_generated=bool(getattr(field, "is_auto_generated", False)),
        auto_config_json=getattr(field, "auto_config_json", None),
        effective_options=resolve_field_effective_options(db, field),
    )


def get_org_template(db: Session, template_id: int, org_id: str) -> models.Template:
    row = (
        db.query(models.Template)
        .filter(
            models.Template.id == template_id,
            models.Template.org_id == org_id,
            models.Template.is_active.is_(True),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


def get_published_flow_for_org_doc_type(
    db: Session, document_type_id: int, org_id: str
) -> models.FlowConfig:
    row = (
        db.query(models.FlowConfig)
        .join(
            models.OrgDocumentType,
            models.FlowConfig.document_type_id == models.OrgDocumentType.id,
        )
        .filter(
            models.FlowConfig.document_type_id == document_type_id,
            models.FlowConfig.is_published.is_(True),
            models.OrgDocumentType.org_id == org_id,
            models.OrgDocumentType.is_active.is_(True),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


def get_draft_flow_for_org_doc_type(
    db: Session, document_type_id: int, org_id: str
) -> models.FlowConfig | None:
    """Latest unpublished draft for the org document type, or None."""
    return (
        db.query(models.FlowConfig)
        .join(
            models.OrgDocumentType,
            models.FlowConfig.document_type_id == models.OrgDocumentType.id,
        )
        .filter(
            models.FlowConfig.document_type_id == document_type_id,
            models.FlowConfig.is_published.is_(False),
            models.OrgDocumentType.org_id == org_id,
            models.OrgDocumentType.is_active.is_(True),
        )
        .order_by(models.FlowConfig.version.desc())
        .first()
    )


def resolvable_field_keys_for_published_flow(
    db: Session, flow: models.FlowConfig
) -> set[str]:
    """FieldDefinition.field_key values + fixed outputs from selector steps."""
    keys: set[str] = set()
    steps = (
        db.query(models.FlowStep)
        .filter(models.FlowStep.flow_config_id == flow.id)
        .all()
    )
    step_ids = [s.id for s in steps]
    if step_ids:
        for fd in (
            db.query(models.FieldDefinition)
            .filter(models.FieldDefinition.flow_step_id.in_(step_ids))
            .all()
        ):
            keys.add(fd.field_key)
    for step in steps:
        keys.update(FIXED_STEP_OUTPUT_KEYS.get(step.step_type, frozenset()))
    return keys


def required_field_keys_for_published_flow(
    db: Session, flow: models.FlowConfig
) -> set[str]:
    step_ids = [
        s.id
        for s in db.query(models.FlowStep)
        .filter(models.FlowStep.flow_config_id == flow.id)
        .all()
    ]
    if not step_ids:
        return set()
    return {
        fd.field_key
        for fd in db.query(models.FieldDefinition)
        .filter(
            models.FieldDefinition.flow_step_id.in_(step_ids),
            models.FieldDefinition.is_required.is_(True),
            models.FieldDefinition.is_auto_generated.is_(False),
        )
        .all()
    }


def auto_ref_field_definitions_for_flow(
    db: Session, flow: models.FlowConfig
) -> list[models.FieldDefinition]:
    """FieldDefinitions on this flow flagged as auto-generated ref numbers."""
    step_ids = [
        s.id
        for s in db.query(models.FlowStep)
        .filter(models.FlowStep.flow_config_id == flow.id)
        .all()
    ]
    if not step_ids:
        return []
    return (
        db.query(models.FieldDefinition)
        .filter(
            models.FieldDefinition.flow_step_id.in_(step_ids),
            models.FieldDefinition.is_auto_generated.is_(True),
        )
        .order_by(models.FieldDefinition.id.asc())
        .all()
    )


def ensure_platform_legacy_template_fks(db: Session) -> dict[str, int]:
    """
    Template still requires legacy NOT NULL FKs (document_type_id, company_id,
    trade_id, country_id). Platform templates use sentinel catalog rows so we
    do not need to alter those columns in this phase.
    """
    country = (
        db.query(models.Country)
        .filter(models.Country.is_platform_sentinel.is_(True))
        .first()
    )
    if not country:
        country = (
            db.query(models.Country)
            .filter(models.Country.code == PLATFORM_LEGACY_COUNTRY_CODE)
            .first()
        )
    if not country:
        country = models.Country(
            name="Platform Placeholder",
            code=PLATFORM_LEGACY_COUNTRY_CODE,
            is_platform_sentinel=True,
        )
        db.add(country)
        db.flush()
    elif not getattr(country, "is_platform_sentinel", False):
        country.is_platform_sentinel = True

    trade = (
        db.query(models.Trade)
        .filter(
            models.Trade.is_platform_sentinel.is_(True),
            models.Trade.country_id == country.id,
        )
        .first()
    )
    if not trade:
        trade = (
            db.query(models.Trade)
            .filter(
                models.Trade.name == PLATFORM_LEGACY_TRADE_NAME,
                models.Trade.country_id == country.id,
            )
            .first()
        )
    if not trade:
        trade = models.Trade(
            name=PLATFORM_LEGACY_TRADE_NAME,
            country_id=country.id,
            is_platform_sentinel=True,
        )
        db.add(trade)
        db.flush()
    elif not getattr(trade, "is_platform_sentinel", False):
        trade.is_platform_sentinel = True

    company = (
        db.query(models.Company)
        .filter(
            models.Company.is_platform_sentinel.is_(True),
            models.Company.trade_id == trade.id,
            models.Company.country_id == country.id,
        )
        .first()
    )
    if not company:
        company = (
            db.query(models.Company)
            .filter(
                models.Company.name == PLATFORM_LEGACY_COMPANY_NAME,
                models.Company.trade_id == trade.id,
                models.Company.country_id == country.id,
            )
            .first()
        )
    if not company:
        company = models.Company(
            name=PLATFORM_LEGACY_COMPANY_NAME,
            trade_id=trade.id,
            country_id=country.id,
            is_platform_sentinel=True,
        )
        db.add(company)
        db.flush()
    elif not getattr(company, "is_platform_sentinel", False):
        company.is_platform_sentinel = True

    doc_type = (
        db.query(models.DocumentType)
        .filter(models.DocumentType.is_platform_sentinel.is_(True))
        .first()
    )
    if not doc_type:
        doc_type = (
            db.query(models.DocumentType)
            .filter(models.DocumentType.slug == PLATFORM_LEGACY_DOC_TYPE_SLUG)
            .first()
        )
    if not doc_type:
        doc_type = models.DocumentType(
            name="Platform Placeholder",
            slug=PLATFORM_LEGACY_DOC_TYPE_SLUG,
            is_platform_sentinel=True,
        )
        db.add(doc_type)
        db.flush()
    elif not getattr(doc_type, "is_platform_sentinel", False):
        doc_type.is_platform_sentinel = True

    return {
        "document_type_id": doc_type.id,
        "company_id": company.id,
        "trade_id": trade.id,
        "country_id": country.id,
    }


def sanitize_token(value: str) -> str:
    cleaned = _SLUG_SAFE.sub("_", (value or "").strip())[:40]
    return cleaned or "x"


def unique_docx_name(prefix: str) -> str:
    stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    return f"{sanitize_token(prefix)}_{stamp}.docx"


def org_template_dir(template_root: str, org_id: str) -> str:
    return os.path.join(template_root, "orgs", org_id)


def org_output_dir(output_root: str, org_id: str) -> str:
    return os.path.join(output_root, "orgs", org_id)


def log_audit_event(
    db: Session,
    org_id: str,
    actor_user_id: int | None,
    action: str,
    target_type: str,
    target_id,
    metadata: dict | None = None,
) -> None:
    """
    Append an AuditLog row. Failures are swallowed so audit never fails
    the parent business action (deliberate soft-dependency).
    """
    try:
        db.add(
            models.AuditLog(
                org_id=org_id,
                actor_user_id=actor_user_id,
                action=action,
                target_type=target_type,
                target_id=str(target_id),
                metadata_json=metadata,
            )
        )
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass

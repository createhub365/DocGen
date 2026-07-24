"""Placeholder mappings for org templates (prefix /api/platform)."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, get_current_org_user, require_org_role
from database import get_db
from routers.org_templates import _resolve_stored_template_path
from routers.platform_scope import (
    get_draft_flow_for_org_doc_type,
    get_org_template,
    get_published_flow_for_org_doc_type,
    log_audit_event,
    resolvable_field_keys_for_published_flow,
)
from schemas_platform import (
    GenerateFieldsFromPlaceholdersResponse,
    GeneratedFieldFromPlaceholderItem,
    PlaceholderMappingBatchRequest,
    PlaceholderMappingListItem,
    PlaceholderMappingsResponse,
)
from services.placeholder_extractor import extract_placeholders

router = APIRouter(tags=["platform-placeholder-mappings"])

_FIELD_KEY_RE = re.compile(r"^[a-z][a-z0-9_]*$")


def _detected_placeholder_ids(template: models.Template) -> list[str]:
    path = _resolve_stored_template_path(template.docx_filename)
    if not path:
        return []
    return [p["id"] for p in extract_placeholders(path, {})]


def _mapping_completeness(
    db: Session, template: models.Template
) -> tuple[bool, list[str], list[str], list[models.PlaceholderMapping]]:
    path = _resolve_stored_template_path(template.docx_filename)
    rows = (
        db.query(models.PlaceholderMapping)
        .filter(models.PlaceholderMapping.template_id == template.id)
        .all()
    )
    # Missing on-disk/storage file: never treat as complete (empty detect used to
    # mark is_complete=True and let Generate open, then 404 on fill).
    if template.docx_filename and not path:
        mapped_keys = [r.placeholder_key for r in rows if r.is_mapped]
        return False, mapped_keys, mapped_keys or ["__template_file_missing__"], rows

    detected = _detected_placeholder_ids(template)
    mapped_keys = {r.placeholder_key for r in rows if r.is_mapped}
    unmapped = [pid for pid in detected if pid not in mapped_keys]
    is_complete = len(detected) > 0 and len(unmapped) == 0
    # Empty template (no placeholders) is complete only if there are zero placeholders.
    if len(detected) == 0:
        is_complete = True
    return is_complete, detected, unmapped, rows


def _suggest_field_key(placeholder_key: str, resolvable_keys: set[str]) -> str | None:
    """Case-insensitive exact match — mirrors frontend mappingSuggestions.js."""
    needle = (placeholder_key or "").lower()
    if not needle:
        return None
    for key in resolvable_keys:
        if str(key).lower() == needle:
            return key
    return None


def _field_key_from_placeholder(placeholder: str) -> str:
    """Lowercase placeholder for matching; sanitize if it is not a valid key."""
    raw = (placeholder or "").strip().lower()
    if _FIELD_KEY_RE.match(raw):
        return raw
    key = re.sub(r"[^a-z0-9]+", "_", raw).strip("_")
    key = re.sub(r"_+", "_", key)
    if not key or not key[0].isalpha():
        key = f"field_{key or 'value'}"
    return key[:64]


def _humanize_label(placeholder: str) -> str:
    text = (placeholder or "").replace("_", " ").strip()
    return " ".join(part.capitalize() for part in text.split()) or "Field"


@router.post(
    "/templates/{template_id}/generate-fields-from-placeholders",
    response_model=GenerateFieldsFromPlaceholdersResponse,
)
def generate_fields_from_placeholders(
    template_id: int,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    """
    Bulk-create draft FieldDefinitions from template placeholders that do not
    already case-insensitively match a resolvable key on the draft flow.
    Does not publish and does not write PlaceholderMapping rows.
    """
    template = get_org_template(db, template_id, current.org_id)
    if not template.org_document_type_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Template is not linked to an org document type",
        )

    draft = get_draft_flow_for_org_doc_type(
        db, template.org_document_type_id, current.org_id
    )
    if not draft:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Create or edit a draft flow first before generating fields from placeholders",
        )

    detected = _detected_placeholder_ids(template)
    existing_keys = resolvable_field_keys_for_published_flow(db, draft)

    skipped: list[str] = []
    to_create: list[tuple[str, str, str]] = []  # placeholder, field_key, label
    pending_keys: set[str] = set()

    for placeholder in detected:
        if _suggest_field_key(placeholder, existing_keys | pending_keys):
            skipped.append(placeholder)
            continue
        field_key = _field_key_from_placeholder(placeholder)
        if field_key in pending_keys or _suggest_field_key(field_key, existing_keys):
            skipped.append(placeholder)
            continue
        pending_keys.add(field_key)
        to_create.append((placeholder, field_key, _humanize_label(placeholder)))

    step = (
        db.query(models.FlowStep)
        .filter(
            models.FlowStep.flow_config_id == draft.id,
            models.FlowStep.step_type == "custom_fields",
        )
        .order_by(models.FlowStep.order_index.asc())
        .first()
    )
    if not step and to_create:
        max_order = (
            db.query(func.max(models.FlowStep.order_index))
            .filter(models.FlowStep.flow_config_id == draft.id)
            .scalar()
        )
        next_order = 0 if max_order is None else int(max_order) + 1
        step = models.FlowStep(
            flow_config_id=draft.id,
            step_type="custom_fields",
            order_index=next_order,
            is_enabled=True,
            label="Generated fields",
            config_json=None,
        )
        db.add(step)
        db.flush()

    created_items: list[GeneratedFieldFromPlaceholderItem] = []
    if to_create and step:
        for _ph, field_key, field_label in to_create:
            row = models.FieldDefinition(
                flow_step_id=step.id,
                field_key=field_key,
                field_label=field_label,
                field_type="text",
                is_required=True,
                options_json=None,
            )
            db.add(row)
            created_items.append(
                GeneratedFieldFromPlaceholderItem(
                    field_key=field_key,
                    field_label=field_label,
                )
            )
        db.commit()
        db.refresh(step)
    else:
        # No new fields — still succeed (idempotent empty create)
        db.commit()

    step_id = step.id if step else 0

    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "fields.bulk_generated_from_template",
        "Template",
        template.id,
        {
            "flow_config_id": draft.id,
            "flow_step_id": step_id or None,
            "created_count": len(created_items),
            "skipped_count": len(skipped),
            "created_field_keys": [item.field_key for item in created_items],
            "skipped_placeholders": skipped,
        },
    )

    return GenerateFieldsFromPlaceholdersResponse(
        template_id=template.id,
        flow_config_id=draft.id,
        flow_step_id=step_id,
        created=created_items,
        skipped_placeholders=skipped,
    )


@router.post(
    "/templates/{template_id}/mappings",
    response_model=PlaceholderMappingsResponse,
)
def upsert_placeholder_mappings(
    template_id: int,
    body: PlaceholderMappingBatchRequest,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    template = get_org_template(db, template_id, current.org_id)
    if not template.org_document_type_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Template is not linked to an org document type",
        )

    flow = get_published_flow_for_org_doc_type(
        db, template.org_document_type_id, current.org_id
    )
    allowed = resolvable_field_keys_for_published_flow(db, flow)

    failed: list[str] = []
    for item in body.mappings:
        if item.field_key not in allowed:
            failed.append(item.field_key)
    if failed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "One or more field_key values are not resolvable in the published flow",
                "invalid_field_keys": sorted(set(failed)),
            },
        )

    # All-or-nothing upsert after validation
    for item in body.mappings:
        existing = (
            db.query(models.PlaceholderMapping)
            .filter(
                models.PlaceholderMapping.template_id == template.id,
                models.PlaceholderMapping.placeholder_key == item.placeholder_key,
            )
            .first()
        )
        if existing:
            existing.field_key = item.field_key
            existing.is_mapped = True
        else:
            db.add(
                models.PlaceholderMapping(
                    template_id=template.id,
                    placeholder_key=item.placeholder_key,
                    field_key=item.field_key,
                    is_mapped=True,
                )
            )
    db.commit()

    is_complete, detected, unmapped, rows = _mapping_completeness(db, template)
    return PlaceholderMappingsResponse(
        template_id=template.id,
        is_complete=is_complete,
        detected_placeholders=detected,
        unmapped_placeholders=unmapped,
        mappings=[PlaceholderMappingListItem.model_validate(r) for r in rows],
    )


@router.get(
    "/templates/{template_id}/mappings",
    response_model=PlaceholderMappingsResponse,
)
def list_placeholder_mappings(
    template_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    template = get_org_template(db, template_id, current.org_id)
    is_complete, detected, unmapped, rows = _mapping_completeness(db, template)
    return PlaceholderMappingsResponse(
        template_id=template.id,
        is_complete=is_complete,
        detected_placeholders=detected,
        unmapped_placeholders=unmapped,
        mappings=[PlaceholderMappingListItem.model_validate(r) for r in rows],
    )

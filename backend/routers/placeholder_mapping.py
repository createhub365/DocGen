"""Placeholder mappings for org templates (prefix /api/platform)."""

from __future__ import annotations

import re

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, get_current_org_user, require_org_role
from database import get_db
from routers.org_templates import _resolve_stored_template_path
from routers.platform_scope import (
    get_draft_flow_for_template_or_doc_type,
    get_org_template,
    get_published_flow_for_template_or_doc_type,
    log_audit_event,
    resolvable_field_keys_for_published_flow,
)
from schemas_platform import (
    GenerateFieldsFromPlaceholdersRequest,
    GenerateFieldsFromPlaceholdersResponse,
    GeneratedFieldFromPlaceholderItem,
    PossibleDuplicateFieldItem,
    PlaceholderMappingBatchRequest,
    PlaceholderMappingListItem,
    PlaceholderMappingsResponse,
)
from services.placeholder_extractor import extract_placeholders

router = APIRouter(tags=["platform-placeholder-mappings"])

_FIELD_KEY_RE = re.compile(r"^[a-z][a-z0-9_]*$")
# Template placeholders that must never become their own FieldDefinitions —
# they are injected from another field (or logo) at generate/fill time.
INJECT_ONLY_PLACEHOLDERS = frozenset({"ref_number_barcode", "company_logo"})


def _detected_placeholder_ids(template: models.Template) -> list[str]:
    path = _resolve_stored_template_path(template.docx_filename)
    if not path:
        return []
    return [p["id"] for p in extract_placeholders(path, {})]


def _mapping_completeness(
    db: Session,
    template: models.Template,
    *,
    mapping_rows: list[models.PlaceholderMapping] | None = None,
) -> tuple[bool, list[str], list[str], list[models.PlaceholderMapping]]:
    path = _resolve_stored_template_path(template.docx_filename)
    rows = (
        mapping_rows
        if mapping_rows is not None
        else (
            db.query(models.PlaceholderMapping)
            .filter(models.PlaceholderMapping.template_id == template.id)
            .all()
        )
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
    """
    Case-insensitive exact match — mirrors frontend mappingSuggestions.js.

    Special case: {{ref_number_barcode}} maps to the auto-ref field_key
    ``ref_number`` when that key exists (barcode is not its own field).
    """
    needle = (placeholder_key or "").lower()
    if not needle:
        return None
    if needle == "ref_number_barcode":
        for key in resolvable_keys:
            if str(key).lower() == "ref_number":
                return key
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


def _normalize_for_similarity(key: str) -> str:
    """Lowercase alphanumerics only — strips underscores/punctuation for fuzzy compare."""
    return re.sub(r"[^a-z0-9]", "", (key or "").lower())


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i]
        for j, cb in enumerate(b, start=1):
            ins = curr[j - 1] + 1
            delete = prev[j] + 1
            sub = prev[j - 1] + (0 if ca == cb else 1)
            curr.append(min(ins, delete, sub))
        prev = curr
    return prev[-1]


def _similar_existing_keys(candidate: str, existing_keys: set[str]) -> list[str]:
    """
    Conservative near-duplicate detection vs existing field keys.

    Flags when:
    - normalized containment / prefix with shared length >= 4
      (position ⊂ position_title, salary ⊂ annual_salary), or
    - short edit distance for typos (passort ↔ passport, solutation ↔ salutation).
    """
    cand = _normalize_for_similarity(candidate)
    if not cand:
        return []
    hits: list[str] = []
    for key in sorted(existing_keys, key=lambda k: str(k).lower()):
        exist = _normalize_for_similarity(str(key))
        if not exist or exist == cand:
            continue
        shorter, longer = (cand, exist) if len(cand) <= len(exist) else (exist, cand)
        if len(shorter) >= 4 and shorter in longer:
            hits.append(str(key))
            continue
        dist = _levenshtein(cand, exist)
        max_len = max(len(cand), len(exist))
        if max_len <= 8 and dist <= 1:
            hits.append(str(key))
        elif max_len <= 16 and dist <= 2:
            hits.append(str(key))
        elif dist <= 3 and (dist / max_len) <= 0.2:
            hits.append(str(key))
    return hits


@router.post(
    "/templates/{template_id}/generate-fields-from-placeholders",
    response_model=GenerateFieldsFromPlaceholdersResponse,
)
def generate_fields_from_placeholders(
    template_id: int,
    body: GenerateFieldsFromPlaceholdersRequest = Body(
        default_factory=GenerateFieldsFromPlaceholdersRequest
    ),
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    """
    Bulk-create draft FieldDefinitions from template placeholders.

    - Exact key matches are skipped (unchanged).
    - Near-duplicates are held in ``possible_duplicates`` unless the admin
      confirms them via ``create_placeholders`` on a follow-up call.
    - Clear non-duplicates are created immediately on the first call.
    Does not publish and does not write PlaceholderMapping rows.
    """
    template = get_org_template(db, template_id, current.org_id)
    if not template.org_document_type_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Template is not linked to an org document type",
        )

    draft = get_draft_flow_for_template_or_doc_type(db, template, current.org_id)
    if not draft:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Create or edit a draft flow first before generating fields from placeholders",
        )

    confirm_raw = body.create_placeholders or []
    confirm_set = {str(p).strip() for p in confirm_raw if str(p).strip()}
    confirm_only = bool(confirm_set)

    detected = _detected_placeholder_ids(template)
    existing_keys = resolvable_field_keys_for_published_flow(db, draft)

    skipped: list[str] = []
    to_create: list[tuple[str, str, str]] = []  # placeholder, field_key, label
    possible_duplicates: list[PossibleDuplicateFieldItem] = []
    pending_keys: set[str] = set()

    for placeholder in detected:
        # Never create a FieldDefinition for inject-only placeholders
        # (barcode image / logo are driven by other fields at fill time).
        if placeholder.lower() in INJECT_ONLY_PLACEHOLDERS:
            skipped.append(placeholder)
            continue
        if _suggest_field_key(placeholder, existing_keys | pending_keys):
            skipped.append(placeholder)
            continue
        field_key = _field_key_from_placeholder(placeholder)
        if field_key in INJECT_ONLY_PLACEHOLDERS:
            skipped.append(placeholder)
            continue
        if field_key in pending_keys or _suggest_field_key(field_key, existing_keys):
            skipped.append(placeholder)
            continue

        similar = _similar_existing_keys(field_key, existing_keys | pending_keys)
        confirmed = (
            placeholder in confirm_set
            or field_key in confirm_set
            or placeholder.lower() in {c.lower() for c in confirm_set}
            or field_key.lower() in {c.lower() for c in confirm_set}
        )

        if confirm_only and not confirmed:
            # Follow-up call: only create admin-confirmed placeholders.
            continue

        if similar and not confirmed:
            possible_duplicates.append(
                PossibleDuplicateFieldItem(
                    placeholder=placeholder,
                    proposed_field_key=field_key,
                    proposed_field_label=_humanize_label(placeholder),
                    similar_field_keys=similar,
                )
            )
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
            "possible_duplicate_count": len(possible_duplicates),
            "created_field_keys": [item.field_key for item in created_items],
            "skipped_placeholders": skipped,
            "possible_duplicates": [
                {
                    "placeholder": item.placeholder,
                    "proposed_field_key": item.proposed_field_key,
                    "similar_field_keys": item.similar_field_keys,
                }
                for item in possible_duplicates
            ],
            "confirm_only": confirm_only,
        },
    )

    return GenerateFieldsFromPlaceholdersResponse(
        template_id=template.id,
        flow_config_id=draft.id,
        flow_step_id=step_id,
        created=created_items,
        skipped_placeholders=skipped,
        possible_duplicates=possible_duplicates,
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

    flow = get_published_flow_for_template_or_doc_type(db, template, current.org_id)
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

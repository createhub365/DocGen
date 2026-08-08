"""Flow config / steps / field definitions (prefix /api/platform)."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, get_current_org_user, require_org_role
from database import get_db
from routers.platform_scope import (
    copy_flow_steps_and_fields,
    field_definition_read,
    get_org_document_type,
    get_org_field_definition,
    get_org_flow_config,
    get_org_flow_step,
    get_org_option_list,
    get_org_template,
    get_draft_flow_for_template,
    get_published_flow_for_template,
    log_audit_event,
)
from schemas_platform import (
    FieldDefinitionCreateRequest,
    FieldDefinitionRead,
    FieldDefinitionUpdate,
    FlowConfigCreateRequest,
    FlowConfigRead,
    FlowStepCreateRequest,
    FlowStepRead,
    FlowStepUpdate,
)

router = APIRouter(tags=["platform-flow-config"])


@router.post(
    "/{document_type_id}/flow",
    response_model=FlowConfigRead,
    status_code=status.HTTP_201_CREATED,
)
def create_flow_config(
    document_type_id: int,
    body: FlowConfigCreateRequest = Body(default_factory=FlowConfigCreateRequest),
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    get_org_document_type(db, document_type_id, current.org_id)

    next_version = body.version
    if next_version is None:
        max_v = (
            db.query(func.max(models.FlowConfig.version))
            .filter(models.FlowConfig.document_type_id == document_type_id)
            .scalar()
        )
        next_version = int(max_v or 0) + 1

    row = models.FlowConfig(
        document_type_id=document_type_id,
        template_id=None,
        version=next_version,
        is_published=False,
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Flow config version already exists for this document type",
        )
    return row


@router.post(
    "/{flow_config_id}/steps",
    response_model=FlowStepRead,
    status_code=status.HTTP_201_CREATED,
)
def add_flow_step(
    flow_config_id: int,
    body: FlowStepCreateRequest,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    get_org_flow_config(db, flow_config_id, current.org_id)

    step = models.FlowStep(
        flow_config_id=flow_config_id,
        step_type=body.step_type,
        order_index=body.order_index,
        is_enabled=body.is_enabled,
        label=body.label,
        config_json=body.config_json,
    )
    db.add(step)
    try:
        db.commit()
        db.refresh(step)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Step order_index already exists for this flow config",
        )
    return step


@router.get("/{flow_config_id}/steps", response_model=List[FlowStepRead])
def list_flow_steps(
    flow_config_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    get_org_flow_config(db, flow_config_id, current.org_id)
    return (
        db.query(models.FlowStep)
        .filter(models.FlowStep.flow_config_id == flow_config_id)
        .order_by(models.FlowStep.order_index.asc())
        .all()
    )


@router.patch("/steps/{step_id}", response_model=FlowStepRead)
def update_flow_step(
    step_id: int,
    body: FlowStepUpdate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    step = get_org_flow_step(db, step_id, current.org_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(step, key, value)
    try:
        db.commit()
        db.refresh(step)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Step order_index already exists for this flow config",
        )
    return step


@router.delete("/steps/{step_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_flow_step(
    step_id: int,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    step = get_org_flow_step(db, step_id, current.org_id)
    # FieldDefinition has no ORM/database delete cascade, so remove children
    # explicitly before deleting the step.
    (
        db.query(models.FieldDefinition)
        .filter(models.FieldDefinition.flow_step_id == step.id)
        .delete(synchronize_session=False)
    )
    db.delete(step)
    db.commit()
    return None


@router.post("/{flow_config_id}/publish", response_model=FlowConfigRead)
def publish_flow_config(
    flow_config_id: int,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    flow = get_org_flow_config(db, flow_config_id, current.org_id)

    from services.trade_linked_position import assert_flow_trade_position_pairing

    assert_flow_trade_position_pairing(db, flow.id)

    # PlaceholderMapping stores portable field_key strings (not FlowStep /
    # FieldDefinition FKs), so republishing a new version does not invalidate
    # existing template mappings that still resolve by key on the new flow.
    try:
        if flow.template_id is not None:
            (
                db.query(models.FlowConfig)
                .filter(
                    models.FlowConfig.template_id == flow.template_id,
                    models.FlowConfig.is_published.is_(True),
                    models.FlowConfig.id != flow.id,
                )
                .update({"is_published": False}, synchronize_session=False)
            )
        else:
            (
                db.query(models.FlowConfig)
                .filter(
                    models.FlowConfig.document_type_id == flow.document_type_id,
                    models.FlowConfig.is_published.is_(True),
                    models.FlowConfig.id != flow.id,
                )
                .update({"is_published": False}, synchronize_session=False)
            )
        flow.is_published = True
        db.commit()
        db.refresh(flow)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Another published flow already exists for this template"
                if flow.template_id is not None
                else "Another published flow already exists for this document type"
            ),
        )
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "flow.published",
        "FlowConfig",
        flow.id,
        {
            "document_type_id": flow.document_type_id,
            "template_id": flow.template_id,
            "version": flow.version,
        },
    )
    return flow


@router.post(
    "/{document_type_id}/flow/new-draft",
    response_model=FlowConfigRead,
    status_code=status.HTTP_201_CREATED,
)
def create_flow_draft_from_published(
    document_type_id: int,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    """
    Deep-copy the published flow into a new unpublished draft.
    Published version stays published and untouched.
    """
    get_org_document_type(db, document_type_id, current.org_id)

    published = (
        db.query(models.FlowConfig)
        .join(
            models.OrgDocumentType,
            models.FlowConfig.document_type_id == models.OrgDocumentType.id,
        )
        .filter(
            models.FlowConfig.document_type_id == document_type_id,
            models.FlowConfig.is_published.is_(True),
            models.OrgDocumentType.org_id == current.org_id,
        )
        .first()
    )

    if not published:
        draft = (
            db.query(models.FlowConfig)
            .join(
                models.OrgDocumentType,
                models.FlowConfig.document_type_id == models.OrgDocumentType.id,
            )
            .filter(
                models.FlowConfig.document_type_id == document_type_id,
                models.FlowConfig.is_published.is_(False),
                models.OrgDocumentType.org_id == current.org_id,
            )
            .order_by(models.FlowConfig.version.desc())
            .first()
        )
        if not draft:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
        return draft

    max_v = (
        db.query(func.max(models.FlowConfig.version))
        .filter(models.FlowConfig.document_type_id == document_type_id)
        .scalar()
    )
    next_version = int(max_v or 0) + 1

    draft = models.FlowConfig(
        document_type_id=document_type_id,
        template_id=None,
        version=next_version,
        is_published=False,
    )
    db.add(draft)
    db.flush()

    copy_flow_steps_and_fields(
        db, source_flow_id=published.id, dest_flow=draft
    )

    db.commit()
    db.refresh(draft)
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "flow.draft_created",
        "FlowConfig",
        draft.id,
        {
            "document_type_id": document_type_id,
            "source_flow_config_id": published.id,
            "version": draft.version,
        },
    )
    return draft


# ---------------------------------------------------------------------------
# Per-template flow endpoints (Phase A — additive; doc-type routes unchanged)
# ---------------------------------------------------------------------------


@router.post(
    "/templates/{template_id}/flow",
    response_model=FlowConfigRead,
    status_code=status.HTTP_201_CREATED,
)
def create_template_flow_config(
    template_id: int,
    body: FlowConfigCreateRequest = Body(default_factory=FlowConfigCreateRequest),
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    """Create an empty draft flow owned by this template (start empty)."""
    get_org_template(db, template_id, current.org_id)

    next_version = body.version
    if next_version is None:
        max_v = (
            db.query(func.max(models.FlowConfig.version))
            .filter(models.FlowConfig.template_id == template_id)
            .scalar()
        )
        next_version = int(max_v or 0) + 1

    row = models.FlowConfig(
        document_type_id=None,
        template_id=template_id,
        version=next_version,
        is_published=False,
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Flow config version already exists for this template",
        )
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "flow.template_created",
        "FlowConfig",
        row.id,
        {"template_id": template_id, "version": row.version},
    )
    return row


@router.get(
    "/templates/{template_id}/flow/published",
    response_model=FlowConfigRead,
)
def get_template_published_flow(
    template_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    return get_published_flow_for_template(db, template_id, current.org_id)


@router.get(
    "/templates/{template_id}/flow/draft",
    response_model=FlowConfigRead,
)
def get_template_draft_flow(
    template_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    draft = get_draft_flow_for_template(db, template_id, current.org_id)
    if not draft:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return draft


@router.get(
    "/templates/{template_id}/flow/history",
    response_model=List[FlowConfigRead],
)
def list_template_flow_history(
    template_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    get_org_template(db, template_id, current.org_id)
    return (
        db.query(models.FlowConfig)
        .filter(models.FlowConfig.template_id == template_id)
        .order_by(models.FlowConfig.version.asc())
        .all()
    )


@router.post(
    "/templates/{template_id}/flow/new-draft",
    response_model=FlowConfigRead,
    status_code=status.HTTP_201_CREATED,
)
def create_template_flow_draft_from_published(
    template_id: int,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    """Deep-copy this template's published flow into a new unpublished draft."""
    get_org_template(db, template_id, current.org_id)

    published = (
        db.query(models.FlowConfig)
        .filter(
            models.FlowConfig.template_id == template_id,
            models.FlowConfig.is_published.is_(True),
        )
        .first()
    )
    if not published:
        draft = get_draft_flow_for_template(db, template_id, current.org_id)
        if not draft:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Not found"
            )
        return draft

    max_v = (
        db.query(func.max(models.FlowConfig.version))
        .filter(models.FlowConfig.template_id == template_id)
        .scalar()
    )
    next_version = int(max_v or 0) + 1
    draft = models.FlowConfig(
        document_type_id=None,
        template_id=template_id,
        version=next_version,
        is_published=False,
    )
    db.add(draft)
    db.flush()
    copy_flow_steps_and_fields(
        db, source_flow_id=published.id, dest_flow=draft
    )
    db.commit()
    db.refresh(draft)
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "flow.draft_created",
        "FlowConfig",
        draft.id,
        {
            "template_id": template_id,
            "source_flow_config_id": published.id,
            "version": draft.version,
        },
    )
    return draft


@router.get("/{document_type_id}/flow/history", response_model=List[FlowConfigRead])
def list_flow_history(
    document_type_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    get_org_document_type(db, document_type_id, current.org_id)
    return (
        db.query(models.FlowConfig)
        .join(
            models.OrgDocumentType,
            models.FlowConfig.document_type_id == models.OrgDocumentType.id,
        )
        .filter(
            models.FlowConfig.document_type_id == document_type_id,
            models.OrgDocumentType.org_id == current.org_id,
        )
        .order_by(models.FlowConfig.version.asc())
        .all()
    )


@router.get(
    "/{document_type_id}/flow/published",
    response_model=FlowConfigRead,
)
def get_published_flow(
    document_type_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(models.FlowConfig)
        .join(
            models.OrgDocumentType,
            models.FlowConfig.document_type_id == models.OrgDocumentType.id,
        )
        .filter(
            models.FlowConfig.document_type_id == document_type_id,
            models.FlowConfig.is_published.is_(True),
            models.OrgDocumentType.org_id == current.org_id,
            models.OrgDocumentType.is_active.is_(True),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


# ---- Field definitions (Task 0) ----

# Barcode is an inject-only template placeholder driven by the auto-ref field —
# never create/rename a FieldDefinition with this key.
_FORBIDDEN_FIELD_KEYS = frozenset({"ref_number_barcode"})


def _reject_forbidden_field_key(field_key: str) -> None:
    key = (field_key or "").strip().lower()
    if key in _FORBIDDEN_FIELD_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "ref_number_barcode is not a separate field. "
                "Create one Auto reference number field (e.g. ref_number) and map "
                "both {{ref_number}} and {{ref_number_barcode}} to it."
            ),
        )


@router.post(
    "/steps/{step_id}/fields",
    response_model=FieldDefinitionRead,
    status_code=status.HTTP_201_CREATED,
)
def add_field_definition(
    step_id: int,
    body: FieldDefinitionCreateRequest,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    get_org_flow_step(db, step_id, current.org_id)
    field_key = body.field_key.strip()
    _reject_forbidden_field_key(field_key)
    existing = (
        db.query(models.FieldDefinition)
        .filter(
            models.FieldDefinition.flow_step_id == step_id,
            models.FieldDefinition.field_key == field_key,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="field_key already exists on this step",
        )

    option_list_id = body.option_list_id
    if option_list_id is not None:
        get_org_option_list(db, option_list_id, current.org_id)

    is_auto = bool(body.is_auto_generated)
    auto_config = body.auto_config_json
    if is_auto:
        prefix = ""
        if isinstance(auto_config, dict):
            prefix = str(auto_config.get("prefix") or "").strip()
        if not prefix:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="auto_config_json.prefix is required for auto-generated fields",
            )
        auto_config = {"kind": "ref_number", "prefix": prefix}
    elif isinstance(auto_config, dict) and auto_config.get("kind") in (
        "trade_linked_position",
        "trade_linked_duties",  # legacy kind still accepted
    ):
        from services.trade_linked_position import normalize_trade_linked_position_config

        # New canonical kind; legacy trade_linked_duties coerced to position
        # when duties_field_key is supplied, otherwise kept for read compat
        # on older rows — create path always stores trade_linked_position.
        auto_config = normalize_trade_linked_position_config(auto_config)
    else:
        auto_config = None

    row = models.FieldDefinition(
        flow_step_id=step_id,
        field_key=field_key,
        field_label=body.field_label.strip(),
        field_type=body.field_type,
        is_required=False if is_auto else body.is_required,
        options_json=body.options_json,
        option_list_id=option_list_id,
        is_auto_generated=is_auto,
        auto_config_json=auto_config,
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="field_key already exists on this step",
        )
    return field_definition_read(db, row)


@router.get("/steps/{step_id}/fields", response_model=List[FieldDefinitionRead])
def list_field_definitions(
    step_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    get_org_flow_step(db, step_id, current.org_id)
    rows = (
        db.query(models.FieldDefinition)
        .filter(models.FieldDefinition.flow_step_id == step_id)
        .order_by(models.FieldDefinition.id.asc())
        .all()
    )
    return [field_definition_read(db, row) for row in rows]


@router.patch("/fields/{field_id}", response_model=FieldDefinitionRead)
def update_field_definition(
    field_id: int,
    body: FieldDefinitionUpdate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    row = get_org_field_definition(db, field_id, current.org_id)
    data = body.model_dump(exclude_unset=True)
    if "field_key" in data and data["field_key"] is not None:
        data["field_key"] = data["field_key"].strip()
        _reject_forbidden_field_key(data["field_key"])
    if "option_list_id" in data and data["option_list_id"] is not None:
        get_org_option_list(db, data["option_list_id"], current.org_id)

    is_auto = data.get("is_auto_generated", row.is_auto_generated)
    if is_auto:
        cfg = data.get("auto_config_json", row.auto_config_json)
        prefix = ""
        if isinstance(cfg, dict):
            prefix = str(cfg.get("prefix") or "").strip()
        if not prefix:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="auto_config_json.prefix is required for auto-generated fields",
            )
        data["auto_config_json"] = {"kind": "ref_number", "prefix": prefix}
        data["is_required"] = False
        data["is_auto_generated"] = True
    elif "auto_config_json" in data:
        cfg = data.get("auto_config_json")
        if isinstance(cfg, dict) and cfg.get("kind") in (
            "trade_linked_position",
            "trade_linked_duties",
        ):
            from services.trade_linked_position import normalize_trade_linked_position_config

            data["auto_config_json"] = normalize_trade_linked_position_config(cfg)
            data["is_auto_generated"] = False
        else:
            data["auto_config_json"] = None
    elif "is_auto_generated" in data and data["is_auto_generated"] is False:
        # Turning off auto-ref clears config unless a trade-linked kind remains
        # on the row (handled when auto_config_json is explicitly patched).
        existing = row.auto_config_json
        if not (
            isinstance(existing, dict)
            and existing.get("kind")
            in ("trade_linked_position", "trade_linked_duties")
        ):
            data["auto_config_json"] = None

    for key, value in data.items():
        setattr(row, key, value)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="field_key already exists on this step",
        )
    return field_definition_read(db, row)

@router.delete("/fields/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_field_definition(
    field_id: int,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    row = get_org_field_definition(db, field_id, current.org_id)
    db.delete(row)
    db.commit()
    return None

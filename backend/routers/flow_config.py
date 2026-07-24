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
    get_org_document_type,
    get_org_field_definition,
    get_org_flow_config,
    get_org_flow_step,
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

    # PlaceholderMapping stores portable field_key strings (not FlowStep /
    # FieldDefinition FKs), so republishing a new version does not invalidate
    # existing template mappings that still resolve by key on the new flow.
    try:
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
            detail="Another published flow already exists for this document type",
        )
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "flow.published",
        "FlowConfig",
        flow.id,
        {"document_type_id": flow.document_type_id, "version": flow.version},
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
        version=next_version,
        is_published=False,
    )
    db.add(draft)
    db.flush()

    source_steps = (
        db.query(models.FlowStep)
        .filter(models.FlowStep.flow_config_id == published.id)
        .order_by(models.FlowStep.order_index.asc())
        .all()
    )
    for step in source_steps:
        new_step = models.FlowStep(
            flow_config_id=draft.id,
            step_type=step.step_type,
            order_index=step.order_index,
            is_enabled=step.is_enabled,
            label=step.label,
            config_json=step.config_json,
        )
        db.add(new_step)
        db.flush()
        fields = (
            db.query(models.FieldDefinition)
            .filter(models.FieldDefinition.flow_step_id == step.id)
            .all()
        )
        for fd in fields:
            db.add(
                models.FieldDefinition(
                    flow_step_id=new_step.id,
                    field_key=fd.field_key,
                    field_label=fd.field_label,
                    field_type=fd.field_type,
                    is_required=fd.is_required,
                    options_json=fd.options_json,
                )
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

    row = models.FieldDefinition(
        flow_step_id=step_id,
        field_key=field_key,
        field_label=body.field_label.strip(),
        field_type=body.field_type,
        is_required=body.is_required,
        options_json=body.options_json,
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
    return row


@router.get("/steps/{step_id}/fields", response_model=List[FieldDefinitionRead])
def list_field_definitions(
    step_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    get_org_flow_step(db, step_id, current.org_id)
    return (
        db.query(models.FieldDefinition)
        .filter(models.FieldDefinition.flow_step_id == step_id)
        .order_by(models.FieldDefinition.id.asc())
        .all()
    )


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
    return row


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

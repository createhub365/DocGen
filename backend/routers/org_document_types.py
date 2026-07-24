"""Org-scoped document types (prefix /api/platform/document-types)."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import exists, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, get_current_org_user, require_org_role
from database import get_db
from routers.platform_scope import log_audit_event
from schemas_platform import (
    OrgDocumentTypeCreateRequest,
    OrgDocumentTypeListRead,
    OrgDocumentTypeRead,
    OrgDocumentTypeUpdate,
)

router = APIRouter(tags=["platform-document-types"])


@router.post(
    "/",
    response_model=OrgDocumentTypeRead,
    status_code=status.HTTP_201_CREATED,
)
def create_document_type(
    body: OrgDocumentTypeCreateRequest,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    # org_id ALWAYS from auth context — never from request body
    row = models.OrgDocumentType(
        org_id=current.org_id,
        name=body.name.strip(),
        slug=body.slug.strip().lower(),
        description=body.description,
        is_active=True,
        created_by=current.user_id,
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document type slug already exists in this organization",
        )
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "document_type.created",
        "OrgDocumentType",
        row.id,
        metadata={"slug": row.slug},
    )
    return row


@router.get("/", response_model=List[OrgDocumentTypeListRead])
def list_document_types(
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    published_exists = exists().where(
        models.FlowConfig.document_type_id == models.OrgDocumentType.id,
        models.FlowConfig.is_published.is_(True),
    )
    published_version = (
        db.query(func.max(models.FlowConfig.version))
        .filter(
            models.FlowConfig.document_type_id == models.OrgDocumentType.id,
            models.FlowConfig.is_published.is_(True),
        )
        .correlate(models.OrgDocumentType)
        .scalar_subquery()
    )
    draft_exists = exists().where(
        models.FlowConfig.document_type_id == models.OrgDocumentType.id,
        models.FlowConfig.is_published.is_(False),
        models.FlowConfig.version > func.coalesce(published_version, 0),
    )
    rows = (
        db.query(
            models.OrgDocumentType,
            published_exists.label("has_published_flow"),
            draft_exists.label("has_draft_flow"),
        )
        .filter(
            models.OrgDocumentType.org_id == current.org_id,
            models.OrgDocumentType.is_active.is_(True),
        )
        .order_by(models.OrgDocumentType.id.asc())
        .all()
    )
    return [
        OrgDocumentTypeListRead(
            **OrgDocumentTypeRead.model_validate(row).model_dump(),
            has_published_flow=bool(has_published),
            has_draft_flow=bool(has_draft),
        )
        for row, has_published, has_draft in rows
    ]


@router.get("/{document_type_id}", response_model=OrgDocumentTypeRead)
def get_document_type(
    document_type_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(models.OrgDocumentType)
        .filter(
            models.OrgDocumentType.id == document_type_id,
            models.OrgDocumentType.org_id == current.org_id,
            models.OrgDocumentType.is_active.is_(True),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


@router.patch("/{document_type_id}", response_model=OrgDocumentTypeRead)
def update_document_type(
    document_type_id: int,
    body: OrgDocumentTypeUpdate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    row = (
        db.query(models.OrgDocumentType)
        .filter(
            models.OrgDocumentType.id == document_type_id,
            models.OrgDocumentType.org_id == current.org_id,
            models.OrgDocumentType.is_active.is_(True),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    data = body.model_dump(exclude_unset=True)
    if "slug" in data and data["slug"] is not None:
        data["slug"] = data["slug"].strip().lower()
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for key, value in data.items():
        setattr(row, key, value)

    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document type slug already exists in this organization",
        )
    return row


@router.delete("/{document_type_id}", response_model=OrgDocumentTypeRead)
def delete_document_type(
    document_type_id: int,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    """Soft delete via is_active=False."""
    row = (
        db.query(models.OrgDocumentType)
        .filter(
            models.OrgDocumentType.id == document_type_id,
            models.OrgDocumentType.org_id == current.org_id,
            models.OrgDocumentType.is_active.is_(True),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    row.is_active = False
    db.commit()
    db.refresh(row)
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "document_type.deleted",
        "OrgDocumentType",
        row.id,
        metadata={"slug": row.slug},
    )
    return row

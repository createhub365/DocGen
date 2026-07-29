"""Org-scoped template folders within a document type (prefix /api/platform)."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, get_current_org_user, require_org_role
from database import get_db
from routers.platform_scope import (
    get_org_document_type,
    get_org_template_folder,
    log_audit_event,
)
from schemas_platform import (
    TemplateFolderCreate,
    TemplateFolderRead,
    TemplateFolderUpdate,
)

router = APIRouter(tags=["platform-template-folders"])


@router.get(
    "/{document_type_id}/folders",
    response_model=List[TemplateFolderRead],
)
def list_template_folders(
    document_type_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    get_org_document_type(db, document_type_id, current.org_id)
    rows = (
        db.query(models.TemplateFolder)
        .filter(
            models.TemplateFolder.org_id == current.org_id,
            models.TemplateFolder.org_document_type_id == document_type_id,
        )
        .order_by(models.TemplateFolder.name.asc(), models.TemplateFolder.id.asc())
        .all()
    )
    return rows


@router.post(
    "/{document_type_id}/folders",
    response_model=TemplateFolderRead,
    status_code=status.HTTP_201_CREATED,
)
def create_template_folder(
    document_type_id: int,
    body: TemplateFolderCreate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    get_org_document_type(db, document_type_id, current.org_id)
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")

    row = models.TemplateFolder(
        org_id=current.org_id,
        org_document_type_id=document_type_id,
        name=name,
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Folder name already exists for this document type",
        )
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "template_folder.created",
        "TemplateFolder",
        row.id,
        metadata={"name": row.name, "document_type_id": document_type_id},
    )
    return row


@router.patch("/folders/{folder_id}", response_model=TemplateFolderRead)
def rename_template_folder(
    folder_id: int,
    body: TemplateFolderUpdate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    row = get_org_template_folder(db, folder_id, current.org_id)
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    row.name = name
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Folder name already exists for this document type",
        )
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "template_folder.renamed",
        "TemplateFolder",
        row.id,
        metadata={"name": row.name},
    )
    return row


@router.delete("/folders/{folder_id}", status_code=status.HTTP_200_OK)
def delete_template_folder(
    folder_id: int,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    row = get_org_template_folder(db, folder_id, current.org_id)
    # SET NULL via FK ondelete + explicit clear for SQLite / safety.
    (
        db.query(models.Template)
        .filter(models.Template.folder_id == row.id)
        .update({models.Template.folder_id: None}, synchronize_session=False)
    )
    folder_name = row.name
    db.delete(row)
    db.commit()
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "template_folder.deleted",
        "TemplateFolder",
        folder_id,
        metadata={"name": folder_name},
    )
    return {"deleted": True, "id": folder_id, "name": folder_name}

"""Org-scoped template upload (prefix /api/platform)."""

from __future__ import annotations

import os
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, get_current_org_user, require_org_role
from database import get_db
from routers.platform_scope import (
    ensure_platform_legacy_template_fks,
    get_org_document_type,
    org_template_dir,
    unique_docx_name,
)
from services.logo_storage import resolve_template_local_path, save_template_docx
from services.placeholder_extractor import extract_placeholders
from utils.file_utils import safe_join, safe_join_relative, validate_docx_upload

router = APIRouter(tags=["platform-templates"])

TEMPLATE_DIR = os.getenv("TEMPLATE_DIR", "./template_store")


def _resolve_stored_template_path(docx_filename: str) -> str | None:
    """
    Resolve an org template path for read (mapping extract / generate).

    DB stores org-relative paths like orgs/{org_id}/{file}.docx. Files are
    written locally and mirrored to Supabase (basename key). After ephemeral
    disk wipe (e.g. Render redeploy), fall back to resolve_template_local_path
    which re-hydrates from storage into a local cache.
    """
    if not docx_filename:
        return None
    try:
        local = safe_join_relative(TEMPLATE_DIR, docx_filename)
        if os.path.exists(local) and os.path.getsize(local) > 0:
            return local
    except HTTPException:
        pass

    basename = os.path.basename(docx_filename.replace("\\", "/"))
    if not basename:
        return None

    normalized = docx_filename.replace("\\", "/")
    parts = normalized.split("/")
    if len(parts) >= 3 and parts[0] == "orgs" and parts[1]:
        org_dir = org_template_dir(TEMPLATE_DIR, parts[1])
        return resolve_template_local_path(basename, org_dir)
    return resolve_template_local_path(basename, TEMPLATE_DIR)


@router.post("/{document_type_id}/templates", status_code=status.HTTP_201_CREATED)
async def upload_org_template(
    document_type_id: int,
    file: UploadFile = File(...),
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    # Ownership check BEFORE reading/saving any file bytes to disk beyond memory.
    org_doc_type = get_org_document_type(db, document_type_id, current.org_id)

    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are accepted")
    validate_docx_upload(file.filename, file.content_type)

    content = await file.read()
    validate_docx_upload(file.filename, file.content_type, len(content))

    legacy = ensure_platform_legacy_template_fks(db)
    filename = unique_docx_name(org_doc_type.slug)
    org_dir = org_template_dir(TEMPLATE_DIR, current.org_id)

    # Reuse save_template_docx with an org-specific directory (no service change).
    saved_basename = save_template_docx(content, filename, org_dir)
    relative_path = f"orgs/{current.org_id}/{saved_basename}"
    file_path = safe_join(org_dir, saved_basename)

    placeholders = extract_placeholders(file_path, {})

    template = models.Template(
        document_type_id=legacy["document_type_id"],
        company_id=legacy["company_id"],
        trade_id=legacy["trade_id"],
        country_id=legacy["country_id"],
        docx_filename=relative_path,
        org_id=current.org_id,
        org_document_type_id=org_doc_type.id,
        version=1,
        is_active=True,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    return {
        "id": template.id,
        "org_id": template.org_id,
        "org_document_type_id": template.org_document_type_id,
        "docx_filename": template.docx_filename,
        "placeholders": placeholders,
    }


@router.get("/{document_type_id}/templates")
def list_org_templates(
    document_type_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    get_org_document_type(db, document_type_id, current.org_id)
    rows = (
        db.query(models.Template)
        .filter(
            models.Template.org_id == current.org_id,
            models.Template.org_document_type_id == document_type_id,
            models.Template.is_active.is_(True),
        )
        .order_by(models.Template.id.asc())
        .all()
    )
    return [
        {
            "id": t.id,
            "org_id": t.org_id,
            "org_document_type_id": t.org_document_type_id,
            "docx_filename": t.docx_filename,
            "is_active": t.is_active,
            "created_at": t.created_at,
        }
        for t in rows
    ]

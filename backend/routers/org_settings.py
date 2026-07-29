"""Org settings / maintenance endpoints (prefix /api/platform)."""

from __future__ import annotations

import logging
import os
import uuid

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, get_current_org_user, require_org_role
from database import get_db
from routers.org_templates import (
    apply_org_template_thumbnail,
    hash_docx_file,
    resolved_display_name,
    _resolve_stored_template_path,
)
from routers.organizations import organization_to_read
from routers.platform_scope import log_audit_event
from services.logo_storage import (
    delete_org_logo,
    is_remote_path,
    media_type_for_path,
    read_stored_file_bytes,
    save_org_logo,
)
from utils.file_utils import safe_join_relative, validate_org_logo_upload

load_dotenv()

logger = logging.getLogger(__name__)

TEMPLATE_DIR = os.getenv("TEMPLATE_DIR", "./template_store")

router = APIRouter(tags=["platform-settings"])


def _get_active_org(db: Session, org_id: str) -> models.Organization:
    org = (
        db.query(models.Organization)
        .filter(
            models.Organization.id == org_id,
            models.Organization.is_active.is_(True),
        )
        .first()
    )
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    return org


def _assert_logo_path_scoped(stored: str, org_id: str) -> None:
    """Reject paths that escape the caller's org prefix (defense in depth)."""
    if is_remote_path(stored):
        # Remote object keys must include orgs/{org_id}/
        if f"orgs/{org_id}/" not in stored.replace("\\", "/"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Logo not found"
            )
        return
    rel = stored.replace("\\", "/").lstrip("/")
    if not rel.startswith(f"orgs/{org_id}/"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Logo not found"
        )


@router.post("/settings/regenerate-thumbnails")
def regenerate_org_thumbnails(
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    """
    Org-scoped thumbnail backfill / refresh.

    For each active org template: create missing thumbnails, regenerate when
    the stored content hash no longer matches the current file, skip when
    already up to date. Failures are per-template (batch continues).
    Synchronous — fine for typical org template counts.
    """
    rows = (
        db.query(models.Template)
        .filter(
            models.Template.org_id == current.org_id,
            models.Template.is_active.is_(True),
            models.Template.org_document_type_id.isnot(None),
        )
        .order_by(models.Template.id.asc())
        .all()
    )

    summary = {
        "total": len(rows),
        "created": 0,
        "updated": 0,
        "unchanged": 0,
        "failed": 0,
        "failed_details": [],
    }

    for template in rows:
        label = resolved_display_name(template)
        filename = template.docx_filename
        had_thumb = bool(template.thumbnail_path)

        docx_path = _resolve_stored_template_path(template.docx_filename)
        if not docx_path:
            summary["failed"] += 1
            summary["failed_details"].append(
                {
                    "template_id": template.id,
                    "filename": filename,
                    "error": "Template file not found",
                }
            )
            continue

        current_hash = hash_docx_file(docx_path)
        if not current_hash:
            summary["failed"] += 1
            summary["failed_details"].append(
                {
                    "template_id": template.id,
                    "filename": filename,
                    "error": "Could not read template file",
                }
            )
            continue

        if (
            template.thumbnail_path
            and template.thumbnail_source_hash
            and template.thumbnail_source_hash == current_hash
        ):
            summary["unchanged"] += 1
            continue

        ok = apply_org_template_thumbnail(
            template, db, docx_path, source_hash=current_hash
        )
        if not ok:
            summary["failed"] += 1
            summary["failed_details"].append(
                {
                    "template_id": template.id,
                    "filename": filename,
                    "error": "Thumbnail generation failed",
                }
            )
            continue

        if had_thumb:
            summary["updated"] += 1
        else:
            summary["created"] += 1

    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "thumbnails.bulk_regenerated",
        "Organization",
        current.org_id,
        {
            "total": summary["total"],
            "created": summary["created"],
            "updated": summary["updated"],
            "unchanged": summary["unchanged"],
            "failed": summary["failed"],
        },
    )

    return summary


@router.post("/organization/logo")
@router.patch("/organization/logo")
async def upload_organization_logo(
    file: UploadFile = File(...),
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    """Upload or replace the organization branding logo (org_admin only)."""
    content = await file.read()
    validate_org_logo_upload(file.filename, file.content_type, len(content))

    org = _get_active_org(db, current.org_id)
    ext = os.path.splitext(file.filename or "")[1].lower()
    basename = f"logo_{uuid.uuid4().hex}{ext}"
    relative = f"orgs/{current.org_id}/{basename}"
    content_type = file.content_type or media_type_for_path(basename)

    if org.logo_path:
        delete_org_logo(org.logo_path, TEMPLATE_DIR)

    stored = save_org_logo(content, relative, content_type, TEMPLATE_DIR)
    org.logo_path = stored
    db.commit()
    db.refresh(org)

    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "organization.logo_uploaded",
        "Organization",
        current.org_id,
        {"filename": basename, "bytes": len(content)},
    )

    return organization_to_read(org)


@router.delete("/organization/logo", status_code=status.HTTP_200_OK)
def delete_organization_logo(
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    """Remove the organization branding logo (org_admin only)."""
    org = _get_active_org(db, current.org_id)
    if not org.logo_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Logo not found"
        )
    delete_org_logo(org.logo_path, TEMPLATE_DIR)
    org.logo_path = None
    db.commit()
    db.refresh(org)

    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "organization.logo_deleted",
        "Organization",
        current.org_id,
        {},
    )
    return organization_to_read(org)


@router.get("/organization/logo")
def get_organization_logo(
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    """Serve the current org's logo image (404 if none set)."""
    org = _get_active_org(db, current.org_id)
    if not org.logo_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Logo not found"
        )

    stored = org.logo_path
    _assert_logo_path_scoped(stored, current.org_id)

    if is_remote_path(stored):
        payload = read_stored_file_bytes(stored, TEMPLATE_DIR)
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Logo file not found"
            )
        data, media_type = payload
        return Response(
            content=data,
            media_type=media_type,
            headers={"Cache-Control": "private, max-age=300"},
        )

    try:
        path = safe_join_relative(TEMPLATE_DIR, stored.replace("\\", "/"))
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Logo file not found"
        )
    if not os.path.exists(path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Logo file not found"
        )
    return FileResponse(
        path,
        media_type=media_type_for_path(path),
        headers={"Cache-Control": "private, max-age=300"},
    )

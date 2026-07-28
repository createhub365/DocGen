"""Org settings / maintenance endpoints (prefix /api/platform)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, require_org_role
from database import get_db
from routers.org_templates import (
    apply_org_template_thumbnail,
    hash_docx_file,
    resolved_display_name,
    _resolve_stored_template_path,
)
from routers.platform_scope import log_audit_event

logger = logging.getLogger(__name__)

router = APIRouter(tags=["platform-settings"])


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

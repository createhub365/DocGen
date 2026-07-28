"""Org-scoped template upload (prefix /api/platform)."""

from __future__ import annotations

import hashlib
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, get_current_org_user, require_org_role
from database import get_db
from routers.platform_scope import (
    ensure_platform_legacy_template_fks,
    get_org_document_type,
    get_org_template,
    log_audit_event,
    org_template_dir,
    unique_docx_name,
)
from schemas_platform import TemplateDisplayNameUpdate
from services.logo_storage import (
    delete_template_docx,
    is_remote_path,
    resolve_template_local_path,
    save_template_docx,
)
from services.placeholder_extractor import extract_placeholders
from services.thumbnail_gen import generate_docx_thumbnail
from services.thumbnail_service import persist_generated_thumbnail, serve_template_thumbnail
from utils.file_utils import safe_join, safe_join_relative, validate_docx_upload

# Imported lazily inside list handler to avoid circular import with placeholder_mapping.

logger = logging.getLogger(__name__)

router = APIRouter(tags=["platform-templates"])

TEMPLATE_DIR = os.getenv("TEMPLATE_DIR", "./template_store")


def hash_docx_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def hash_docx_file(path: str) -> str | None:
    if not path or not os.path.exists(path):
        return None
    with open(path, "rb") as handle:
        return hash_docx_bytes(handle.read())


def _basename(path: str | None) -> str:
    if not path:
        return "template.docx"
    return os.path.basename(str(path).replace("\\", "/")) or "template.docx"


def resolved_display_name(template: models.Template) -> str:
    """Prefer display_name; fall back to stored filename basename."""
    name = (getattr(template, "display_name", None) or "").strip()
    if name:
        return name
    return _basename(template.docx_filename)


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


def apply_org_template_thumbnail(
    template: models.Template,
    db: Session,
    docx_path: str | None,
    *,
    source_hash: str | None = None,
) -> bool:
    """
    Generate a page preview for an org template.

    Reuses generate_docx_thumbnail + persist_generated_thumbnail (same as admin).
    Never raises — thumbnail is optional.
    On success, stores org-scoped thumbnail_path and thumbnail_source_hash.
    Returns True if a thumbnail was persisted.
    """
    if not template.org_id or not docx_path:
        return False
    try:
        file_hash = source_hash or hash_docx_file(docx_path)
        org_dir = org_template_dir(TEMPLATE_DIR, template.org_id)
        thumbnail_dir = os.path.join(org_dir, "thumbnails")
        thumb_rel = generate_docx_thumbnail(
            docx_path=docx_path,
            thumbnail_dir=thumbnail_dir,
            template_id=template.id,
        )
        if not thumb_rel:
            return False
        persist_generated_thumbnail(template, db, thumb_rel, org_dir)
        # persist writes "thumbnails/…" or a remote storage URL; keep org scope locally.
        path = getattr(template, "thumbnail_path", None)
        if path and not is_remote_path(path):
            normalized = path.replace("\\", "/")
            if normalized.startswith("thumbnails/"):
                template.thumbnail_path = f"orgs/{template.org_id}/{normalized}"
        if file_hash:
            template.thumbnail_source_hash = file_hash
        db.commit()
        db.refresh(template)
        return bool(template.thumbnail_path)
    except Exception as exc:
        logger.warning(
            "Org template thumbnail skipped for template %s: %s", template.id, exc
        )
        return False


# Back-compat alias for older call sites / tests
_apply_org_template_thumbnail = apply_org_template_thumbnail


def _template_list_item(
    t: models.Template, is_complete: bool, *, generated_document_count: int = 0
) -> dict:
    return {
        "id": t.id,
        "org_id": t.org_id,
        "org_document_type_id": t.org_document_type_id,
        "docx_filename": t.docx_filename,
        "display_name": resolved_display_name(t),
        "is_active": t.is_active,
        "created_at": t.created_at,
        "is_complete": is_complete,
        "generated_document_count": generated_document_count,
        "has_thumbnail": bool(t.thumbnail_path),
    }


@router.post("/{document_type_id}/templates", status_code=status.HTTP_201_CREATED)
async def upload_org_template(
    document_type_id: int,
    file: UploadFile = File(...),
    display_name: Optional[str] = Form(None),
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

    # Optional label; omit/blank → original upload filename (backward compatible).
    label = (display_name or "").strip() or file.filename

    template = models.Template(
        document_type_id=legacy["document_type_id"],
        company_id=legacy["company_id"],
        trade_id=legacy["trade_id"],
        country_id=legacy["country_id"],
        docx_filename=relative_path,
        display_name=label,
        org_id=current.org_id,
        org_document_type_id=org_doc_type.id,
        version=1,
        is_active=True,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    apply_org_template_thumbnail(
        template, db, file_path, source_hash=hash_docx_bytes(content)
    )

    return {
        "id": template.id,
        "org_id": template.org_id,
        "org_document_type_id": template.org_document_type_id,
        "docx_filename": template.docx_filename,
        "display_name": resolved_display_name(template),
        "placeholders": placeholders,
        "has_thumbnail": bool(template.thumbnail_path),
    }


@router.get("/{document_type_id}/templates")
def list_org_templates(
    document_type_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    """List active templates; include is_complete (server-side, no FE N+1)."""
    from routers.placeholder_mapping import _mapping_completeness

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
    # Prefetch PlaceholderMapping rows for all templates in one query so
    # completeness checks do not N+1 against mappings (DOCX detect still
    # runs per template — placeholders are not stored as a count column).
    template_ids = [t.id for t in rows]
    if template_ids:
        db.query(models.PlaceholderMapping).filter(
            models.PlaceholderMapping.template_id.in_(template_ids)
        ).all()

    gen_counts: dict[int, int] = {}
    if template_ids:
        for tid, cnt in (
            db.query(
                models.GeneratedDocument.template_id,
                func.count(models.GeneratedDocument.id),
            )
            .filter(models.GeneratedDocument.template_id.in_(template_ids))
            .group_by(models.GeneratedDocument.template_id)
            .all()
        ):
            gen_counts[int(tid)] = int(cnt)

    return [
        _template_list_item(
            t,
            _mapping_completeness(db, t)[0],
            generated_document_count=gen_counts.get(t.id, 0),
        )
        for t in rows
    ]


@router.delete(
    "/{document_type_id}/templates/{template_id}",
    status_code=status.HTTP_200_OK,
)
def delete_org_template(
    document_type_id: int,
    template_id: int,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    """
    Hard-delete an org template + mappings + stored file.

    GeneratedDocument rows that referenced this template keep their files;
    template_id is SET NULL via FK (historical downloads remain available).
    """
    get_org_document_type(db, document_type_id, current.org_id)
    template = (
        db.query(models.Template)
        .filter(
            models.Template.id == template_id,
            models.Template.org_id == current.org_id,
            models.Template.org_document_type_id == document_type_id,
            models.Template.is_active.is_(True),
        )
        .first()
    )
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    display = resolved_display_name(template)
    stored_path = template.docx_filename

    gen_count = (
        db.query(func.count(models.GeneratedDocument.id))
        .filter(models.GeneratedDocument.template_id == template.id)
        .scalar()
        or 0
    )

    # Mappings are meaningless without the template — delete explicitly
    # (FK has no ON DELETE CASCADE in schema).
    db.query(models.PlaceholderMapping).filter(
        models.PlaceholderMapping.template_id == template.id
    ).delete(synchronize_session=False)

    # Clear FK before delete so SQLite (tests) and Postgres SET NULL both work;
    # Postgres ON DELETE SET NULL would also handle this after migration.
    db.query(models.GeneratedDocument).filter(
        models.GeneratedDocument.template_id == template.id
    ).update({models.GeneratedDocument.template_id: None}, synchronize_session=False)

    db.delete(template)
    db.commit()

    # Best-effort file cleanup after DB commit
    delete_template_docx(stored_path, TEMPLATE_DIR)

    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "template.deleted",
        "Template",
        template_id,
        {
            "document_type_id": document_type_id,
            "display_name": display,
            "generated_documents_retained": int(gen_count),
        },
    )

    return {
        "deleted": True,
        "id": template_id,
        "display_name": display,
        "generated_documents_retained": int(gen_count),
    }


@router.patch("/templates/{template_id}")
def rename_org_template(
    template_id: int,
    body: TemplateDisplayNameUpdate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    template = get_org_template(db, template_id, current.org_id)
    name = (body.display_name or "").strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="display_name is required",
        )
    template.display_name = name
    db.commit()
    db.refresh(template)
    return {
        "id": template.id,
        "org_id": template.org_id,
        "org_document_type_id": template.org_document_type_id,
        "docx_filename": template.docx_filename,
        "display_name": resolved_display_name(template),
    }


@router.get("/{document_type_id}/templates/{template_id}/thumbnail")
def get_org_template_thumbnail(
    document_type_id: int,
    template_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    """Serve org template page-1 thumbnail PNG (404 if missing or cross-org)."""
    get_org_document_type(db, document_type_id, current.org_id)
    template = (
        db.query(models.Template)
        .filter(
            models.Template.id == template_id,
            models.Template.org_id == current.org_id,
            models.Template.org_document_type_id == document_type_id,
            models.Template.is_active.is_(True),
        )
        .first()
    )
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return serve_template_thumbnail(template, TEMPLATE_DIR)


@router.get("/{document_type_id}/templates/{template_id}/download")
def download_org_template_docx(
    document_type_id: int,
    template_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    """Download org template .docx for in-browser preview (any org member)."""
    get_org_document_type(db, document_type_id, current.org_id)
    template = (
        db.query(models.Template)
        .filter(
            models.Template.id == template_id,
            models.Template.org_id == current.org_id,
            models.Template.org_document_type_id == document_type_id,
            models.Template.is_active.is_(True),
        )
        .first()
    )
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    file_path = _resolve_stored_template_path(template.docx_filename)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template file not found",
        )

    filename = _basename(template.docx_filename)
    return FileResponse(
        file_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

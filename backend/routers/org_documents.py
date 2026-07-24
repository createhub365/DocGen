"""Org-scoped document generation (prefix /api/platform)."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, get_current_org_user, require_org_role
from database import get_db
from routers.org_templates import _resolve_stored_template_path
from routers.placeholder_mapping import _mapping_completeness
from routers.platform_scope import (
    get_org_document_type,
    get_published_flow_for_org_doc_type,
    org_output_dir,
    required_field_keys_for_published_flow,
    sanitize_token,
    log_audit_event,
)
from schemas_platform import OrgGenerateRequest, OrgGenerateResponse
from services.doc_generator import fill_template
from services.pdf_converter import try_convert_to_pdf
from utils.file_utils import safe_join, safe_join_relative

router = APIRouter(tags=["platform-documents"])

OUTPUT_DIR = os.getenv("OUTPUT_DIR", "./output")


def _should_attempt_pdf_conversion() -> bool:
    """
    Purely additive test scaffolding. Default (env unset) is True — same as
    always calling try_convert_to_pdf before Phase 3.

    TEST-ONLY: DOCGEN_SKIP_PDF must not be set in production environment files.
    """
    return os.getenv("DOCGEN_SKIP_PDF", "").lower() not in ("1", "true", "yes")


def _get_org_generated_document(
    db: Session, doc_id: int, org_id: str
) -> models.GeneratedDocument:
    row = (
        db.query(models.GeneratedDocument)
        .filter(
            models.GeneratedDocument.id == doc_id,
            models.GeneratedDocument.org_id == org_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


def _resolve_org_template_for_doc_type(
    db: Session,
    document_type_id: int,
    org_id: str,
    template_id: int | None,
) -> models.Template:
    q = db.query(models.Template).filter(
        models.Template.org_id == org_id,
        models.Template.org_document_type_id == document_type_id,
        models.Template.is_active.is_(True),
    )
    if template_id is not None:
        q = q.filter(models.Template.id == template_id)
    row = q.order_by(models.Template.id.desc()).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


@router.post(
    "/{document_type_id}/generate",
    response_model=OrgGenerateResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_org_document(
    document_type_id: int,
    body: OrgGenerateRequest,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    org_doc_type = get_org_document_type(db, document_type_id, current.org_id)
    flow = get_published_flow_for_org_doc_type(db, org_doc_type.id, current.org_id)
    template = _resolve_org_template_for_doc_type(
        db, org_doc_type.id, current.org_id, body.template_id
    )

    is_complete, _detected, unmapped, mappings = _mapping_completeness(db, template)
    if not is_complete:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Template placeholder mappings are incomplete",
                "unmapped_placeholders": unmapped,
            },
        )

    required = required_field_keys_for_published_flow(db, flow)
    submitted = body.fields or {}
    missing = [
        key
        for key in sorted(required)
        if key not in submitted
        or submitted.get(key) is None
        or (isinstance(submitted.get(key), str) and not str(submitted.get(key)).strip())
    ]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Missing required fields",
                "missing_fields": missing,
            },
        )

    # Build placeholder -> value using PlaceholderMapping (field_key → submitted value)
    fill_data: dict = {}
    for m in mappings:
        if not m.is_mapped:
            continue
        fill_data[m.placeholder_key] = submitted.get(m.field_key, "")

    template_path = _resolve_stored_template_path(template.docx_filename)
    if not template_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "Template file not found on the server. "
                "Re-upload the .docx on the Templates tab "
                "(Render disk is ephemeral unless the file is in Supabase storage)."
            ),
        )

    out_dir = org_output_dir(OUTPUT_DIR, current.org_id)
    os.makedirs(out_dir, exist_ok=True)
    stamp = datetime.utcnow().strftime("%d%m%Y")
    unique = str(uuid.uuid4())[:8]
    base_name = (
        f"{sanitize_token(org_doc_type.slug)}_{stamp}_{unique}.docx"
    )
    output_path = safe_join(out_dir, base_name)
    relative_docx = f"orgs/{current.org_id}/{base_name}"

    # EXISTING pipeline — do not reimplement XML fill
    fill_template(template_path, fill_data, output_path)

    pdf_path, _pdf_error = None, None
    # TEST-ONLY: DOCGEN_SKIP_PDF — must never be set in production .env files.
    # When unset/false, behavior is identical to pre-Phase-3 (always call try_convert_to_pdf).
    if _should_attempt_pdf_conversion():
        pdf_path, _pdf_error = try_convert_to_pdf(output_path, out_dir)
    pdf_filename = None
    if pdf_path:
        pdf_basename = os.path.basename(pdf_path)
        pdf_filename = f"orgs/{current.org_id}/{pdf_basename}"

    generated = models.GeneratedDocument(
        user_id=current.user_id,
        template_id=template.id,
        form_data_json=json.dumps({"fields": submitted, "fill_data": fill_data}),
        docx_filename=relative_docx,
        pdf_filename=pdf_filename,
        org_id=current.org_id,
    )
    db.add(generated)
    db.commit()
    db.refresh(generated)

    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "document.generated",
        "GeneratedDocument",
        generated.id,
        {
            "document_type_id": org_doc_type.id,
            "template_id": template.id,
        },
    )

    return OrgGenerateResponse(
        document_id=generated.id,
        docx_url=f"/api/platform/generated/{generated.id}/download",
        pdf_url=(
            f"/api/platform/generated/{generated.id}/download?format=pdf"
            if pdf_filename
            else None
        ),
        pdf_available=bool(pdf_filename),
        filename=relative_docx,
    )


@router.get("/generated")
def list_generated_documents(
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.GeneratedDocument)
        .filter(models.GeneratedDocument.org_id == current.org_id)
        .order_by(models.GeneratedDocument.id.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "org_id": r.org_id,
            "template_id": r.template_id,
            "docx_filename": r.docx_filename,
            "pdf_filename": r.pdf_filename,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.get("/generated/{doc_id}/download")
def download_generated_document(
    doc_id: int,
    format: str = "docx",
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    doc = _get_org_generated_document(db, doc_id, current.org_id)
    if format == "pdf":
        if not doc.pdf_filename:
            raise HTTPException(status_code=404, detail="Not found")
        rel = doc.pdf_filename
        media = "application/pdf"
    else:
        if not doc.docx_filename:
            raise HTTPException(status_code=404, detail="Not found")
        rel = doc.docx_filename
        media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    try:
        path = safe_join_relative(OUTPUT_DIR, rel)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Not found")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Not found")

    return FileResponse(
        path,
        media_type=media,
        filename=os.path.basename(rel),
    )

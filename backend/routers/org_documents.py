"""Org-scoped document generation (prefix /api/platform)."""

from __future__ import annotations

import json
import os
import secrets
import uuid
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, get_current_org_user
from database import get_db
from routers.org_templates import _resolve_stored_template_path
from routers.placeholder_mapping import _mapping_completeness
from routers.platform_scope import (
    auto_ref_field_definitions_for_flow,
    get_org_document_type,
    get_published_flow_for_org_doc_type,
    org_output_dir,
    required_field_keys_for_published_flow,
    sanitize_token,
    log_audit_event,
)
from schemas_platform import (
    OrgGenerateRequest,
    OrgGenerateResponse,
    SendEmailRequest,
    SendTelegramRequest,
    ShareLinkResponse,
)
from services.doc_generator import fill_template
from services.document_email import send_document_email
from services.org_ref_counter import get_next_ref_number
from services.pdf_converter import try_convert_to_pdf
from services.telegram_bot import send_document as telegram_send_document
from utils.file_utils import safe_join, safe_join_relative

router = APIRouter(tags=["platform-documents"])

OUTPUT_DIR = os.getenv("OUTPUT_DIR", "./output")
SHARE_TOKEN_TTL_HOURS = 48


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
        row = q.filter(models.Template.id == template_id).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
        return row

    # When the client omits template_id, prefer a mapping-complete template
    # (latest id alone can pick an unmapped upload and 400).
    candidates = q.order_by(models.Template.id.desc()).all()
    if not candidates:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    for row in candidates:
        is_complete, _, _, _ = _mapping_completeness(db, row)
        if is_complete:
            return row
    return candidates[0]


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
    submitted = dict(body.fields or {})

    # Auto-ref fields: allocate server-side and override any client-supplied value.
    auto_ref_values: dict[str, str] = {}
    for fd in auto_ref_field_definitions_for_flow(db, flow):
        cfg = fd.auto_config_json if isinstance(fd.auto_config_json, dict) else {}
        kind = str(cfg.get("kind") or "ref_number")
        if kind != "ref_number":
            continue
        prefix = str(cfg.get("prefix") or "").strip()
        if not prefix:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Auto reference field is missing a prefix",
                    "field_key": fd.field_key,
                },
            )
        try:
            value = get_next_ref_number(
                db, current.org_id, document_type_id, prefix
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc
        submitted[fd.field_key] = value
        auto_ref_values[fd.field_key] = value

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

    # Drive legacy barcode injection in fill_template (looks for key "ref_number").
    # One auto-ref field_key can map to both {{ref_number}} and {{ref_number_barcode}}.
    if auto_ref_values:
        primary = auto_ref_values.get("ref_number") or next(
            iter(auto_ref_values.values())
        )
        fill_data["ref_number"] = primary
        # Ensure barcode placeholder is not left as text if unmapped/mis-mapped.
        fill_data.pop("ref_number_barcode", None)

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
        db.query(
            models.GeneratedDocument,
            models.OrgDocumentType.name.label("document_type_name"),
        )
        .outerjoin(
            models.Template,
            models.Template.id == models.GeneratedDocument.template_id,
        )
        .outerjoin(
            models.OrgDocumentType,
            models.OrgDocumentType.id == models.Template.org_document_type_id,
        )
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
            "document_type_name": document_type_name
            or (
                f"Template #{r.template_id}"
                if r.template_id
                else "Deleted template"
            ),
        }
        for r, document_type_name in rows
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


def _read_org_generated_pdf_bytes(
    doc: models.GeneratedDocument,
) -> tuple[bytes, str]:
    if not doc.pdf_filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PDF is not available for this document",
        )
    try:
        path = safe_join_relative(OUTPUT_DIR, doc.pdf_filename)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "Generated PDF file is missing on the server. "
                "Generate the document again, then retry send/share."
            ),
        )
    if not os.path.exists(path):
        # Common on Render free tier: ./output is ephemeral and cleared on redeploy.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "Generated PDF file is missing on the server "
                "(often cleared after a redeploy). "
                "Generate the document again, then retry send/share."
            ),
        )
    with open(path, "rb") as fh:
        data = fh.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PDF file is empty or unavailable",
        )
    return data, os.path.basename(doc.pdf_filename)


@router.post(
    "/generated/{doc_id}/share-link",
    response_model=ShareLinkResponse,
)
def create_share_link(
    doc_id: int,
    request: Request,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    """
    Create a reusable-until-expiry public PDF download link (default 48h).

    Any org member who can already access the document may create a share link.
    """
    doc = _get_org_generated_document(db, doc_id, current.org_id)
    if not doc.pdf_filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PDF is not available for this document",
        )
    # Confirm file still exists
    _read_org_generated_pdf_bytes(doc)

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=SHARE_TOKEN_TTL_HOURS)
    row = models.DocumentShareToken(
        generated_document_id=doc.id,
        org_id=current.org_id,
        token=token,
        expires_at=expires_at,
        created_by=current.user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    base = str(request.base_url).rstrip("/")
    share_url = f"{base}/api/public/shared/{token}"

    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "share_link.created",
        "GeneratedDocument",
        str(doc.id),
        {"token_id": row.id, "expires_at": expires_at.isoformat()},
    )
    return ShareLinkResponse(
        token=token,
        share_url=share_url,
        expires_at=expires_at,
    )


@router.post("/generated/{doc_id}/send-telegram")
def send_generated_via_telegram(
    doc_id: int,
    body: SendTelegramRequest,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    doc = _get_org_generated_document(db, doc_id, current.org_id)
    contact = (
        db.query(models.TelegramContact)
        .filter(
            models.TelegramContact.id == body.telegram_contact_id,
            models.TelegramContact.org_id == current.org_id,
        )
        .first()
    )
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    pdf_bytes, filename = _read_org_generated_pdf_bytes(doc)
    try:
        telegram_send_document(
            chat_id=contact.chat_id,
            filename=filename,
            file_bytes=pdf_bytes,
            caption=f"Document #{doc.id}",
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "document.sent_telegram",
        "GeneratedDocument",
        str(doc.id),
        {
            "telegram_contact_id": contact.id,
            "contact_label": contact.label,
        },
    )
    return {"ok": True, "document_id": doc.id, "telegram_contact_id": contact.id}


@router.post("/generated/{doc_id}/send-email")
def send_generated_via_email(
    doc_id: int,
    body: SendEmailRequest,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    """
    Send the generated PDF as a real attachment.

    Unlike invite email (soft-fail), failures are returned to the client —
    sending is the purpose of this action.
    """
    doc = _get_org_generated_document(db, doc_id, current.org_id)
    pdf_bytes, filename = _read_org_generated_pdf_bytes(doc)

    org = (
        db.query(models.Organization)
        .filter(models.Organization.id == current.org_id)
        .first()
    )
    org_name = org.name if org else "DocGen Pro"
    note = (body.message or "").strip()
    lines = [
        f"Please find the attached document from {org_name}.",
        "",
    ]
    if note:
        lines.extend([note, ""])
    lines.append(f"Document id: {doc.id}")

    try:
        send_document_email(
            to_email=body.recipient_email,
            subject=f"Document from {org_name}",
            body="\n".join(lines),
            filename=filename,
            pdf_bytes=pdf_bytes,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "document.sent_email",
        "GeneratedDocument",
        str(doc.id),
        {"recipient_email": body.recipient_email},
    )
    return {"ok": True, "document_id": doc.id, "recipient_email": body.recipient_email}

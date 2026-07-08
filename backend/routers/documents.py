import json
import os
import re
import shutil
import tempfile
import uuid
from datetime import datetime

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import get_db
from schemas import GenerateRequest, GenerateResponse, DocumentListItem, PaginatedDocumentsResponse
from services.doc_generator import fill_template
from services.employer_prefill import merge_generation_fields, employer_logo_path
from services.occupation_codes import resolve_country_code
from utils.duty_resolver import resolve_duties
from services.pdf_converter import pdf_converter_available, try_convert_to_pdf
from services.template_storage import require_template_docx_path
from utils.file_utils import remove_file, safe_filename, safe_join

load_dotenv()
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "./output")
TEMPLATE_DIR = os.getenv("TEMPLATE_DIR", "./template_store")
LOGO_DIR = os.getenv("LOGO_DIR", "./uploads/logos")

router = APIRouter(tags=["documents"])


def _sanitize_filename(value: str) -> str:
    value = value.replace(" ", "_")
    value = re.sub(r"[^\w\-_.]", "", value)
    return value.lower()


def _can_access_document(user: models.User, doc: models.GeneratedDocument) -> bool:
    return user.role == "admin" or doc.user_id == user.id


def verify_document_access(doc_id: int, current_user: models.User, db: Session) -> models.GeneratedDocument:
    doc = db.query(models.GeneratedDocument).filter(models.GeneratedDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_access_document(current_user, doc):
        raise HTTPException(status_code=403, detail="Access denied")
    return doc


def get_employer_logo_path(employer_id, db):
    if not employer_id:
        return None
    employer = db.query(models.Employer).filter(models.Employer.id == employer_id).first()
    if not employer:
        return None
    logo_path = employer_logo_path(employer, LOGO_DIR)
    if not logo_path:
        print(f"[WARN] Logo file not found for employer id={employer_id}", flush=True)
    return logo_path


def _resolve_template(db: Session, body: GenerateRequest) -> models.Template:
    if body.template_id:
        template = (
            db.query(models.Template)
            .filter(models.Template.id == body.template_id, models.Template.is_active == True)
            .first()
        )
        if template:
            return template

    if body.template:
        selector = body.template
        doc_type = (
            db.query(models.DocumentType)
            .filter(models.DocumentType.slug == selector.get("doc_type"))
            .first()
        )
        country = (
            db.query(models.Country)
            .filter(models.Country.name == selector.get("country"))
            .first()
        )
        if not doc_type or not country:
            raise HTTPException(status_code=404, detail="Document type or country not found")

        template = (
            db.query(models.Template)
            .filter(
                models.Template.document_type_id == doc_type.id,
                models.Template.country_id == country.id,
                models.Template.category == selector.get("category"),
                models.Template.format_slug == selector.get("format"),
                models.Template.is_active == True,
            )
            .first()
        )
        if template:
            return template

    raise HTTPException(status_code=404, detail="Template not found or inactive")


def _prepare_form_data(db: Session, body: GenerateRequest) -> tuple[dict, models.Employer | None, list | None]:
    user_fields = body.resolved_fields()
    employer = None
    trade_info = None
    trade_duties = None

    if body.employer_id:
        employer = db.query(models.Employer).filter(models.Employer.id == body.employer_id).first()
        if not employer:
            raise HTTPException(status_code=404, detail="Employer not found")
        trade_category = body.trade_category
        if not trade_category and body.template:
            trade_category = body.template.get("trade_category")
        country = body.template.get("country") if body.template else employer.country
        merged, trade_info = merge_generation_fields(
            employer, body.trade, country, trade_category, user_fields
        )
        if trade_info:
            country_name = body.template.get("country") if body.template else employer.country
            country_code = resolve_country_code(country_name) or "NZ"
            trade_duties = resolve_duties(trade_info, country_code)
        return merged, employer, trade_duties

    return user_fields, None, None


def _build_document_list_item(doc: models.GeneratedDocument, db: Session) -> DocumentListItem | None:
    template = doc.template
    if not template:
        template = db.query(models.Template).filter(models.Template.id == doc.template_id).first()
    company = (
        db.query(models.Company).filter(models.Company.id == template.company_id).first()
        if template
        else None
    )
    country = (
        db.query(models.Country).filter(models.Country.id == template.country_id).first()
        if template
        else None
    )
    trade = (
        db.query(models.Trade).filter(models.Trade.id == template.trade_id).first()
        if template
        else None
    )
    doc_type_obj = (
        db.query(models.DocumentType)
        .filter(models.DocumentType.id == template.document_type_id)
        .first()
        if template
        else None
    )
    doc_user = db.query(models.User).filter(models.User.id == doc.user_id).first()

    company_name = company.name if company else "Unknown"
    if not company and doc.form_data_json:
        try:
            form_data = json.loads(doc.form_data_json)
            company_name = form_data.get("company_name") or company_name
        except json.JSONDecodeError:
            pass

    doc_type_name = doc_type_obj.name if doc_type_obj else "Unknown"

    return DocumentListItem(
        id=doc.id,
        created_at=doc.created_at,
        doc_type_name=doc_type_name,
        company_name=company_name,
        country_name=country.name if country else "Unknown",
        trade_name=trade.name if trade else "Unknown",
        docx_url=f"/api/documents/{doc.id}/download/docx",
        pdf_url=f"/api/documents/{doc.id}/download/pdf" if doc.pdf_filename else None,
        username=doc_user.username if doc_user else None,
    )


@router.post("/preview-pdf")
def preview_document_pdf(
    body: GenerateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Return filled PDF for accurate preview (logos, stamps, layout match Word)."""
    available, reason = pdf_converter_available()
    if not available:
        raise HTTPException(
            status_code=503,
            detail=f"PDF unavailable: {reason}",
        )

    preview_docx = None
    preview_dir = None
    try:
        template = _resolve_template(db, body)

        docx_template_path = require_template_docx_path(template.docx_filename, TEMPLATE_DIR)

        form_data, employer, trade_duties = _prepare_form_data(db, body)
        logo_path = employer_logo_path(employer, LOGO_DIR) if employer else None

        fd_docx, preview_docx = tempfile.mkstemp(suffix=".docx")
        os.close(fd_docx)
        fill_template(
            docx_template_path,
            form_data,
            preview_docx,
            logo_path=logo_path,
            trade_duties=trade_duties,
        )

        preview_dir = tempfile.mkdtemp()
        try:
            pdf_path, pdf_warning = try_convert_to_pdf(preview_docx, preview_dir)
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail=str(exc)[:300] or "PDF preview requires Microsoft Word on Windows",
            ) from exc

        if not pdf_path:
            raise HTTPException(
                status_code=503,
                detail=pdf_warning or "PDF preview requires Microsoft Word on Windows",
            )

        background_tasks.add_task(remove_file, preview_docx)
        background_tasks.add_task(lambda: shutil.rmtree(preview_dir, ignore_errors=True))
        background_tasks.add_task(remove_file, pdf_path)

        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename="preview.pdf",
            headers={"Content-Disposition": 'inline; filename="preview.pdf"'},
        )
    except HTTPException:
        if preview_docx and os.path.exists(preview_docx):
            remove_file(preview_docx)
        if preview_dir and os.path.isdir(preview_dir):
            shutil.rmtree(preview_dir, ignore_errors=True)
        raise
    except Exception as exc:
        if preview_docx and os.path.exists(preview_docx):
            remove_file(preview_docx)
        if preview_dir and os.path.isdir(preview_dir):
            shutil.rmtree(preview_dir, ignore_errors=True)
        raise HTTPException(
            status_code=503,
            detail=str(exc)[:300] or "PDF preview requires Microsoft Word on Windows",
        ) from exc


@router.post("/preview")
def preview_document(
    body: GenerateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Return filled .docx for preview — same file as generate, placeholders only changed."""
    template = _resolve_template(db, body)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found or inactive")

    docx_template_path = require_template_docx_path(template.docx_filename, TEMPLATE_DIR)

    form_data, employer, trade_duties = _prepare_form_data(db, body)
    logo_path = get_employer_logo_path(body.employer_id, db)

    fd, preview_path = tempfile.mkstemp(suffix=".docx")
    os.close(fd)
    fill_template(
        docx_template_path,
        form_data,
        preview_path,
        logo_path=logo_path,
        trade_duties=trade_duties,
    )
    background_tasks.add_task(remove_file, preview_path)

    return FileResponse(
        preview_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename="preview.docx",
        headers={"Content-Disposition": 'inline; filename="preview.docx"'},
    )


@router.post("/generate", response_model=GenerateResponse)
def generate_doc(
    body: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    template = _resolve_template(db, body)

    docx_template_path = require_template_docx_path(template.docx_filename, TEMPLATE_DIR)

    form_data, employer, trade_duties = _prepare_form_data(db, body)
    logo_path = get_employer_logo_path(body.employer_id, db)

    doc_type = (
        db.query(models.DocumentType)
        .filter(models.DocumentType.id == template.document_type_id)
        .first()
    )

    timestamp = datetime.utcnow().strftime("%d%m%Y")
    unique_id = str(uuid.uuid4())[:8]
    if employer:
        company_name = _sanitize_filename(employer.company_name)
        cand_name = _sanitize_filename(
            form_data.get("candidate_full_name") or form_data.get("cand_name") or "candidate"
        )
        output_filename = f"OfferLetter_{company_name}_{cand_name}_{timestamp}_{unique_id}.docx"
    else:
        company = db.query(models.Company).filter(models.Company.id == template.company_id).first()
        company_name = _sanitize_filename(company.name if company else "unknown")
        doc_type_slug = _sanitize_filename(doc_type.slug if doc_type else "document")
        output_filename = f"{doc_type_slug}_{company_name}_{timestamp}_{unique_id}.docx"

    output_docx_path = os.path.join(OUTPUT_DIR, output_filename)

    fill_template(
        docx_template_path,
        form_data,
        output_docx_path,
        logo_path=logo_path,
        trade_duties=trade_duties,
    )

    pdf_path, pdf_error = try_convert_to_pdf(output_docx_path, OUTPUT_DIR)
    pdf_filename = os.path.basename(pdf_path) if pdf_path else None

    generated = models.GeneratedDocument(
        user_id=current_user.id,
        template_id=template.id,
        form_data_json=json.dumps(form_data),
        docx_filename=output_filename,
        pdf_filename=pdf_filename,
    )
    db.add(generated)
    db.commit()
    db.refresh(generated)

    pdf_url = (
        f"/api/documents/{generated.id}/download/pdf" if pdf_filename else None
    )
    return GenerateResponse(
        document_id=generated.id,
        docx_url=f"/api/documents/{generated.id}/download/docx",
        pdf_url=pdf_url,
        pdf_warning=pdf_error,
        pdf_available=pdf_filename is not None,
        pdf_error=pdf_error,
        filename=output_filename,
    )


@router.get("/documents", response_model=PaginatedDocumentsResponse)
def list_documents(
    page: int = 1,
    limit: int = Query(default=20, le=100),
    search: str | None = None,
    employer_id: int | None = None,
    doc_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    all_users: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.GeneratedDocument)

    if current_user.role != "admin" or not all_users:
        query = query.filter(models.GeneratedDocument.user_id == current_user.id)

    if employer_id:
        employer = db.query(models.Employer).filter(models.Employer.id == employer_id).first()
        if employer:
            query = query.filter(
                models.GeneratedDocument.form_data_json.contains(f'"{employer.company_name}"')
            )

    if date_from:
        try:
            start = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.filter(models.GeneratedDocument.created_at >= start)
        except ValueError:
            pass

    if date_to:
        try:
            end = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            query = query.filter(models.GeneratedDocument.created_at <= end)
        except ValueError:
            pass

    if doc_type or search:
        query = (
            query.outerjoin(models.Template)
            .outerjoin(models.Company, models.Template.company_id == models.Company.id)
            .outerjoin(
                models.DocumentType,
                models.Template.document_type_id == models.DocumentType.id,
            )
        )
        if doc_type:
            query = query.filter(models.DocumentType.slug == doc_type)
        if search:
            term = search.lower()
            query = query.filter(
                or_(
                    func.lower(models.Company.name).contains(term),
                    func.lower(models.DocumentType.name).contains(term),
                    func.lower(models.GeneratedDocument.form_data_json).contains(term),
                )
            )

    total = query.count()
    page = max(1, page)
    limit = min(max(1, limit), 100)
    pages = max(1, -(-total // limit)) if total else 1

    docs = (
        query.order_by(models.GeneratedDocument.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    items = [_build_document_list_item(doc, db) for doc in docs]

    return PaginatedDocumentsResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


@router.get("/documents/{document_id}/download/docx")
def download_docx(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = verify_document_access(document_id, current_user, db)
    safe_name = safe_filename(doc.docx_filename)
    file_path = safe_join(OUTPUT_DIR, safe_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="DOCX file not found")

    return FileResponse(
        file_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=safe_name,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.get("/documents/{document_id}/download/pdf")
def download_pdf(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = verify_document_access(document_id, current_user, db)
    if not doc.pdf_filename:
        raise HTTPException(status_code=404, detail="PDF file not found")
    safe_name = safe_filename(doc.pdf_filename)
    file_path = safe_join(OUTPUT_DIR, safe_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="PDF file not found")

    return FileResponse(
        file_path,
        media_type="application/pdf",
        filename=safe_name,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )

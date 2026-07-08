import json
import logging
import os
import re
import tempfile
from datetime import datetime, date
from datetime import time as dt_time

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import models
from auth import get_admin_user
from database import get_db
from schemas import (
    CountryCreate,
    TradeCreate,
    CompanyCreate,
    UserCreate,
    UserUpdate,
    UserPasswordUpdate,
    TemplateUpdate,
    AdminStatsResponse,
    UserResponse,
)
from services.trade_bank_admin import (
    create_custom_industry,
    create_custom_trade,
    delete_custom_trade,
    get_merged_trade_bank,
    update_custom_trade,
)
from services.placeholder_extractor import extract_placeholders
from services.thumbnail_gen import generate_docx_thumbnail, regenerate_all_thumbnails
from services.thumbnail_service import persist_generated_thumbnail, serve_template_thumbnail
from services.template_storage import require_template_docx_path
from services.logo_storage import save_template_docx, resolve_template_local_path
from services.employer_import import (
    MAX_EMPLOYER_CSV_SIZE,
    import_employer_rows,
    parse_csv_text,
)
from utils.file_utils import (
    remove_file,
    safe_join,
    safe_join_relative,
    validate_docx_upload,
    MAX_TEMPLATE_SIZE,
)

load_dotenv()
TEMPLATE_DIR = os.getenv("TEMPLATE_DIR", "./template_store")

router = APIRouter(tags=["admin"])
logger = logging.getLogger(__name__)


def _sanitize(value: str) -> str:
    value = value.replace(" ", "_")
    value = re.sub(r"[^\w\-]", "", value)
    return value.lower()


@router.post("/templates/preview-placeholders")
async def preview_placeholders(
    file: UploadFile = File(...),
    _: models.User = Depends(get_admin_user),
):
    if not file.filename or not file.filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are accepted")
    validate_docx_upload(file.filename, file.content_type)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp:
        content = await file.read()
        validate_docx_upload(file.filename, file.content_type, len(content))
        tmp.write(content)
        tmp_path = tmp.name

    try:
        placeholders = extract_placeholders(tmp_path, {})
        return {"placeholders": placeholders}
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@router.post("/templates")
async def upload_template(
    file: UploadFile = File(...),
    country_id: int = Form(...),
    trade_id: int = Form(...),
    company_id: int = Form(...),
    document_type_id: int = Form(...),
    industry: str = Form(""),
    label_overrides_json: str = Form(""),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_admin_user),
):
    if not file.filename or not file.filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are accepted")
    validate_docx_upload(file.filename, file.content_type)

    country = db.query(models.Country).filter(models.Country.id == country_id).first()
    trade = db.query(models.Trade).filter(models.Trade.id == trade_id).first()
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    doc_type = (
        db.query(models.DocumentType)
        .filter(models.DocumentType.id == document_type_id)
        .first()
    )
    if not all([country, trade, company, doc_type]):
        raise HTTPException(status_code=400, detail="Invalid country, trade, company, or document type")

    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    filename = (
        f"{_sanitize(country.code)}_{_sanitize(trade.name)}_{_sanitize(company.name)}"
        f"_{_sanitize(doc_type.slug)}_v{timestamp}.docx"
    )
    file_path = os.path.join(TEMPLATE_DIR, filename)

    content = await file.read()
    validate_docx_upload(file.filename, file.content_type, len(content))
    save_template_docx(content, filename, TEMPLATE_DIR)
    file_path = safe_join(TEMPLATE_DIR, filename)

    label_overrides = {}
    if label_overrides_json:
        try:
            label_overrides = json.loads(label_overrides_json)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid label_overrides_json")

    placeholders = extract_placeholders(file_path, label_overrides)

    template = models.Template(
        document_type_id=document_type_id,
        company_id=company_id,
        trade_id=trade_id,
        country_id=country_id,
        docx_filename=filename,
        category=industry.strip() or None,
        label_overrides_json=json.dumps(label_overrides) if label_overrides else None,
        version=1,
        is_active=True,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    _apply_template_thumbnail(template, db, file_path)

    return {
        "id": template.id,
        "docx_filename": template.docx_filename,
        "is_active": template.is_active,
        "placeholders": placeholders,
    }


def _apply_template_thumbnail(template, db, docx_path: str | None = None) -> None:
    """Generate thumbnail after upload/replace. Never raises — upload must succeed."""
    if docx_path is None:
        docx_path = resolve_template_local_path(template.docx_filename, TEMPLATE_DIR)
    if not docx_path:
        return

    thumbnail_dir = os.path.join(TEMPLATE_DIR, "thumbnails")
    try:
        thumb_rel = generate_docx_thumbnail(
            docx_path=docx_path,
            thumbnail_dir=thumbnail_dir,
            template_id=template.id,
        )
        persist_generated_thumbnail(template, db, thumb_rel, TEMPLATE_DIR)
    except Exception as exc:
        logger.warning("Thumbnail skipped for template %s: %s", template.id, exc)


def _parse_label_overrides(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            raise ValueError("label_overrides_json must be a JSON object")
        return parsed
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid label_overrides_json") from exc


def _validate_template_assignment(
    db: Session,
    country_id: int,
    trade_id: int,
    company_id: int,
    document_type_id: int,
) -> tuple:
    country = db.query(models.Country).filter(models.Country.id == country_id).first()
    trade = db.query(models.Trade).filter(models.Trade.id == trade_id).first()
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    doc_type = (
        db.query(models.DocumentType)
        .filter(models.DocumentType.id == document_type_id)
        .first()
    )
    if not all([country, trade, company, doc_type]):
        raise HTTPException(status_code=400, detail="Invalid country, trade, company, or document type")
    if trade.country_id != country_id:
        raise HTTPException(status_code=400, detail="Trade does not belong to selected country")
    if company.trade_id != trade_id or company.country_id != country_id:
        raise HTTPException(status_code=400, detail="Company does not belong to selected trade/country")
    return country, trade, company, doc_type


def _get_template_or_404(template_id: int, db: Session) -> models.Template:
    template = db.query(models.Template).filter(models.Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


def _template_response(template: models.Template, db: Session) -> dict:
    docx_path = resolve_template_local_path(template.docx_filename, TEMPLATE_DIR)
    label_overrides = _parse_label_overrides(template.label_overrides_json)
    placeholders = extract_placeholders(docx_path, label_overrides) if docx_path else []
    return {
        "id": template.id,
        "country_id": template.country_id,
        "trade_id": template.trade_id,
        "company_id": template.company_id,
        "document_type_id": template.document_type_id,
        "docx_filename": template.docx_filename,
        "thumbnail_path": template.thumbnail_path,
        "version": template.version,
        "is_active": template.is_active,
        "label_overrides_json": template.label_overrides_json,
        "placeholders": placeholders,
    }


@router.put("/templates/{template_id}")
async def update_template(
    request: Request,
    template_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_admin_user),
):
    template = db.query(models.Template).filter(models.Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    content_type = request.headers.get("content-type", "")
    docx_updated = False

    if "multipart/form-data" in content_type:
        form = await request.form()
        uploaded = form.get("file")
        if uploaded and getattr(uploaded, "filename", None):
            validate_docx_upload(uploaded.filename, uploaded.content_type)
            content = await uploaded.read()
            validate_docx_upload(uploaded.filename, uploaded.content_type, len(content))
            if len(content) > MAX_TEMPLATE_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"File too large. Max {MAX_TEMPLATE_SIZE // (1024 * 1024)}MB",
                )
            docx_path = safe_join(TEMPLATE_DIR, template.docx_filename)
            save_template_docx(content, template.docx_filename, TEMPLATE_DIR)
            template.version = (template.version or 1) + 1
            docx_updated = True

        if "label_overrides_json" in form:
            raw = form.get("label_overrides_json")
            if raw is not None:
                _parse_label_overrides(str(raw))
                template.label_overrides_json = str(raw)
        if "is_active" in form:
            raw = form.get("is_active")
            if raw is not None:
                template.is_active = str(raw).lower() in ("true", "1", "yes")
    else:
        body = TemplateUpdate(**await request.json())
        if body.label_overrides_json is not None:
            _parse_label_overrides(body.label_overrides_json)
            template.label_overrides_json = body.label_overrides_json
        if body.is_active is not None:
            template.is_active = body.is_active

    db.commit()
    db.refresh(template)

    if docx_updated:
        _apply_template_thumbnail(template, db)

    response = _template_response(template, db)
    response["message"] = "Template updated successfully"
    return response


@router.post("/templates/{template_id}/edit")
async def edit_template(
    template_id: int,
    file: UploadFile | None = File(None),
    country_id: int | None = Form(None),
    trade_id: int | None = Form(None),
    company_id: int | None = Form(None),
    document_type_id: int | None = Form(None),
    label_overrides_json: str | None = Form(None),
    is_active: str | None = Form(None),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_admin_user),
):
    """Update template assignment, labels, active flag, and/or replace the .docx file."""
    template = db.query(models.Template).filter(models.Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    new_country_id = country_id if country_id is not None else template.country_id
    new_trade_id = trade_id if trade_id is not None else template.trade_id
    new_company_id = company_id if company_id is not None else template.company_id
    new_doc_type_id = document_type_id if document_type_id is not None else template.document_type_id

    country, trade, company, doc_type = _validate_template_assignment(
        db, new_country_id, new_trade_id, new_company_id, new_doc_type_id
    )

    template.country_id = new_country_id
    template.trade_id = new_trade_id
    template.company_id = new_company_id
    template.document_type_id = new_doc_type_id

    if label_overrides_json is not None:
        label_overrides = _parse_label_overrides(label_overrides_json)
        template.label_overrides_json = json.dumps(label_overrides) if label_overrides else None

    if is_active is not None:
        template.is_active = is_active.lower() in ("true", "1", "yes")

    if file and file.filename:
        validate_docx_upload(file.filename, file.content_type)
        content = await file.read()
        validate_docx_upload(file.filename, file.content_type, len(content))
        if len(content) > MAX_TEMPLATE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Max {MAX_TEMPLATE_SIZE // (1024 * 1024)}MB",
            )

        template.version = (template.version or 1) + 1
        docx_path = safe_join(TEMPLATE_DIR, template.docx_filename)
        save_template_docx(content, template.docx_filename, TEMPLATE_DIR)

    db.commit()
    db.refresh(template)

    if file and file.filename:
        _apply_template_thumbnail(template, db, docx_path)

    return _template_response(template, db)


@router.get("/templates/{template_id}/download")
def download_template_docx(
    template_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_admin_user),
):
    """Download the raw .docx template for editing in Microsoft Word."""
    template = _get_template_or_404(template_id, db)
    file_path = require_template_docx_path(template.docx_filename, TEMPLATE_DIR)

    return FileResponse(
        file_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=template.docx_filename,
        headers={"Content-Disposition": f'attachment; filename="{template.docx_filename}"'},
    )


@router.get("/templates/{template_id}/thumbnail")
def get_template_thumbnail(
    template_id: int,
    db: Session = Depends(get_db),
):
    """Serve template page-1 thumbnail PNG."""
    template = _get_template_or_404(template_id, db)
    return serve_template_thumbnail(template, TEMPLATE_DIR)


@router.post("/templates/regenerate-thumbnails")
def regenerate_thumbnails(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_admin_user),
):
    """Regenerate thumbnails for all active templates (backfill)."""
    templates = (
        db.query(models.Template)
        .filter(models.Template.is_active == True)
        .all()
    )

    results = regenerate_all_thumbnails(TEMPLATE_DIR, templates)

    for tid in results["success"]:
        rel = results["paths"].get(tid)
        if not rel:
            continue
        row = db.query(models.Template).filter(models.Template.id == tid).first()
        if row:
            persist_generated_thumbnail(row, db, rel, TEMPLATE_DIR)

    return {
        "message": f"Regenerated {len(results['success'])} thumbnails",
        "success": len(results["success"]),
        "failed": len(results["failed"]),
        "failed_ids": results["failed"],
    }


@router.get("/templates")
def list_admin_templates(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_admin_user),
):
    templates = (
        db.query(models.Template)
        .filter(models.Template.is_active == True)
        .order_by(models.Template.created_at.desc())
        .all()
    )
    result = []
    for t in templates:
        country = db.query(models.Country).filter(models.Country.id == t.country_id).first()
        trade = db.query(models.Trade).filter(models.Trade.id == t.trade_id).first()
        company = db.query(models.Company).filter(models.Company.id == t.company_id).first()
        doc_type = (
            db.query(models.DocumentType)
            .filter(models.DocumentType.id == t.document_type_id)
            .first()
        )
        docx_path = resolve_template_local_path(t.docx_filename, TEMPLATE_DIR)
        placeholder_count = 0
        if docx_path:
            label_overrides = {}
            if t.label_overrides_json:
                try:
                    label_overrides = json.loads(t.label_overrides_json)
                except json.JSONDecodeError:
                    pass
            placeholder_count = len(extract_placeholders(docx_path, label_overrides))

        result.append({
            "id": t.id,
            "country_id": t.country_id,
            "trade_id": t.trade_id,
            "company_id": t.company_id,
            "document_type_id": t.document_type_id,
            "country_name": country.name if country else "",
            "trade_name": trade.name if trade else "",
            "company_name": company.name if company else "",
            "doc_type_name": doc_type.name if doc_type else "",
            "doc_type_slug": doc_type.slug if doc_type else "",
            "category": t.category,
            "format_slug": t.format_slug,
            "format_label": t.format_label,
            "docx_filename": t.docx_filename,
            "thumbnail_path": t.thumbnail_path,
            "has_thumbnail": bool(t.thumbnail_path),
            "version": t.version,
            "is_active": t.is_active,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "placeholder_count": placeholder_count,
            "label_overrides_json": t.label_overrides_json,
        })
    return result


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_admin_user),
):
    template = db.query(models.Template).filter(models.Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    template.is_active = False
    db.commit()
    return {"detail": "Template deactivated"}


@router.post("/countries")
def add_country(
    body: CountryCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_admin_user),
):
    existing = db.query(models.Country).filter(models.Country.code == body.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Country code already exists")
    country = models.Country(name=body.name, code=body.code.lower())
    db.add(country)
    db.commit()
    db.refresh(country)
    return {"id": country.id, "name": country.name, "code": country.code}


@router.post("/trades")
def add_trade(
    body: TradeCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_admin_user),
):
    trade = models.Trade(name=body.name, country_id=body.country_id)
    db.add(trade)
    db.commit()
    db.refresh(trade)
    return {"id": trade.id, "name": trade.name, "country_id": trade.country_id}


@router.post("/companies")
def add_company(
    body: CompanyCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_admin_user),
):
    company = models.Company(
        name=body.name,
        trade_id=body.trade_id,
        country_id=body.country_id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return {
        "id": company.id,
        "name": company.name,
        "trade_id": company.trade_id,
        "country_id": company.country_id,
    }


@router.get("/stats", response_model=AdminStatsResponse)
def get_stats(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_admin_user),
):
    today = date.today()
    today_start = datetime.combine(today, dt_time.min)
    month_start = datetime.combine(today.replace(day=1), dt_time.min)

    total_docs = db.query(models.GeneratedDocument).count()
    active_templates = (
        db.query(models.Template).filter(models.Template.is_active == True).count()
    )
    total_companies = db.query(models.Company).count()

    docs_today = (
        db.query(models.GeneratedDocument)
        .filter(models.GeneratedDocument.created_at >= today_start)
        .count()
    )
    docs_month = (
        db.query(models.GeneratedDocument)
        .filter(models.GeneratedDocument.created_at >= month_start)
        .count()
    )

    return AdminStatsResponse(
        total_documents_generated=total_docs,
        total_active_templates=active_templates,
        total_companies=total_companies,
        documents_today=docs_today,
        documents_this_month=docs_month,
    )


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_admin_user),
):
    users = db.query(models.User).order_by(models.User.created_at.desc()).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "name": (getattr(u, "full_name", None) or "").strip() or u.username,
            "role": u.role,
            "is_active": bool(getattr(u, "is_active", True)),
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


def _user_to_response(user: models.User) -> UserResponse:
    name = (getattr(user, "full_name", None) or "").strip() or user.username
    return UserResponse(
        id=user.id,
        username=user.username,
        name=name,
        role=user.role,
        is_active=bool(getattr(user, "is_active", True)),
        created_at=user.created_at.isoformat() if user.created_at else None,
    )


def _get_user_or_404(user_id: int, db: Session) -> models.User:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _guard_self_action(admin: models.User, target: models.User, action: str) -> None:
    if admin.id == target.id:
        raise HTTPException(status_code=400, detail=f"You cannot {action} your own account")


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    body: UserUpdate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_admin_user),
):
    user = _get_user_or_404(user_id, db)
    updates = body.model_dump(exclude_unset=True)

    if "username" in updates:
        new_username = (updates["username"] or "").strip()
        if not new_username:
            raise HTTPException(status_code=400, detail="Username is required")
        if new_username != user.username:
            existing = (
                db.query(models.User)
                .filter(models.User.username == new_username, models.User.id != user.id)
                .first()
            )
            if existing:
                raise HTTPException(status_code=400, detail="Username already exists")
            user.username = new_username

    if "name" in updates:
        new_name = (updates["name"] or "").strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Name is required")
        user.full_name = new_name

    if "role" in updates:
        if updates["role"] not in ("admin", "staff"):
            raise HTTPException(status_code=400, detail="Role must be admin or staff")
        if user.id == admin.id and updates["role"] != "admin":
            raise HTTPException(status_code=400, detail="You cannot remove your own admin role")
        user.role = updates["role"]

    if "is_active" in updates:
        if user.id == admin.id and not updates["is_active"]:
            _guard_self_action(admin, user, "deactivate")
        user.is_active = bool(updates["is_active"])

    db.commit()
    db.refresh(user)
    return _user_to_response(user)


@router.put("/users/{user_id}/password", response_model=UserResponse)
def reset_user_password(
    user_id: int,
    body: UserPasswordUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_admin_user),
):
    from auth import hash_password

    user = _get_user_or_404(user_id, db)
    password = (body.password or "").strip()
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user.password_hash = hash_password(password)
    db.commit()
    db.refresh(user)
    return _user_to_response(user)


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_admin_user),
):
    user = _get_user_or_404(user_id, db)
    _guard_self_action(admin, user, "delete")

    doc_count = (
        db.query(models.GeneratedDocument)
        .filter(models.GeneratedDocument.user_id == user.id)
        .count()
    )
    if doc_count > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a user with generated documents. Deactivate the account instead.",
        )

    db.delete(user)
    db.commit()
    return {"ok": True}


@router.get("/trade-bank")
def get_trade_bank(
    _: models.User = Depends(get_admin_user),
):
    return get_merged_trade_bank()


@router.post("/trade-bank/industries")
def add_custom_industry(
    body: dict = Body(...),
    _: models.User = Depends(get_admin_user),
):
    record = create_custom_industry(body)
    return {"ok": True, "industry": record}


@router.post("/trade-bank/trades")
def add_custom_trade(
    body: dict = Body(...),
    _: models.User = Depends(get_admin_user),
):
    record = create_custom_trade(body)
    return {"ok": True, "trade": record}


@router.put("/trade-bank/trades/{trade_id}")
def edit_custom_trade(
    trade_id: str,
    body: dict = Body(...),
    _: models.User = Depends(get_admin_user),
):
    record = update_custom_trade(trade_id, body)
    return {"ok": True, "trade": record}


@router.delete("/trade-bank/trades/{trade_id}")
def remove_custom_trade(
    trade_id: str,
    _: models.User = Depends(get_admin_user),
):
    delete_custom_trade(trade_id)
    return {"ok": True}


@router.post("/users", response_model=UserResponse)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_admin_user),
):
    from auth import hash_password

    existing = db.query(models.User).filter(models.User.username == body.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    if body.role not in ("admin", "staff"):
        raise HTTPException(status_code=400, detail="Role must be admin or staff")
    display_name = (body.name or "").strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="Name is required")

    user = models.User(
        username=body.username.strip(),
        full_name=display_name,
        password_hash=hash_password(body.password),
        role=body.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_to_response(user)


@router.post("/employers/import-csv")
async def import_employers_csv(
    file: UploadFile = File(...),
    update_existing: bool = Form(default=False),
    dry_run: bool = Form(default=False),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_admin_user),
):
    """Import employers from uploaded CSV. Returns preview or import summary."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files accepted")

    content = await file.read()
    if len(content) > MAX_EMPLOYER_CSV_SIZE:
        raise HTTPException(status_code=400, detail="CSV file too large (max 5MB)")

    try:
        text = content.decode("utf-8-sig")
        rows = parse_csv_text(text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded") from exc

    return import_employer_rows(
        db,
        rows,
        dry_run=dry_run,
        update_existing=update_existing,
    )

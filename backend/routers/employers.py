import os
import re
import uuid
from datetime import datetime

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import get_db
from routers.form_helpers import logo_api_url
from services.employer_templates import summarize_all_employers, summarize_employer_templates
from utils.file_utils import safe_filename, validate_logo_upload, safe_join

load_dotenv()

LOGO_DIR = os.getenv("LOGO_DIR", "./uploads/logos")

router = APIRouter(tags=["employers"])


def _employer_to_dict(employer: models.Employer, summary: dict | None = None) -> dict:
    cache_key = ""
    if employer.updated_at:
        cache_key = str(int(employer.updated_at.timestamp()))
    elif employer.created_at:
        cache_key = str(int(employer.created_at.timestamp()))

    logo_url = None
    if employer.company_logo_path:
        logo_url = f"{logo_api_url(employer.company_logo_path)}?v={cache_key}"

    return {
        "id": employer.id,
        "company_name": employer.company_name,
        "company_trading_name": employer.company_trading_name,
        "company_logo_path": employer.company_logo_path,
        "logo_url": logo_url,
        "country": employer.country,
        "industry": employer.industry,
        "reg_number_label": employer.reg_number_label,
        "reg_number_value": employer.reg_number_value,
        "company_address": employer.company_address,
        "company_city": employer.company_city,
        "company_state": employer.company_state,
        "company_postcode": employer.company_postcode,
        "company_email": employer.company_email,
        "company_website": employer.company_website,
        "hr_contact_name": employer.hr_contact_name,
        "hr_contact_title": employer.hr_contact_title,
        "hr_email": employer.hr_email,
        "employer_accreditation_no": employer.employer_accreditation_no,
        "signatory_name": employer.signatory_name,
        "signatory_designation": employer.signatory_designation,
        "created_at": employer.created_at.isoformat() if employer.created_at else None,
        "updated_at": employer.updated_at.isoformat() if employer.updated_at else None,
        "template_count": (summary or {}).get("template_count", 0),
        "documents_issued": (summary or {}).get("documents_issued", 0),
        "industries": (summary or {}).get("industries", []),
        "doc_types": (summary or {}).get("doc_types", []),
        "templates": (summary or {}).get("templates", []),
    }


async def _save_logo(file: UploadFile, company_name: str) -> str:
    content = await file.read()
    validate_logo_upload(file.filename, file.content_type, len(content))
    ext = os.path.splitext(file.filename or "")[1].lower()
    os.makedirs(LOGO_DIR, exist_ok=True)
    safe_name = re.sub(r"[^\w\-]", "_", company_name.strip()) or "employer"
    filename = f"employer_{safe_name}_{uuid.uuid4().hex}{ext}"
    path = os.path.join(LOGO_DIR, filename)
    with open(path, "wb") as f:
        f.write(content)
    return filename


@router.get("/employers")
def list_employers(
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Employer).order_by(models.Employer.company_name)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                models.Employer.company_name.ilike(term),
                models.Employer.country.ilike(term),
                models.Employer.industry.ilike(term),
            )
        )
    employers = query.all()
    summaries = summarize_all_employers(db, employers, current_user)
    return [_employer_to_dict(e, summaries.get(e.id)) for e in employers]


@router.get("/employers/{employer_id}/template-summary")
def get_employer_template_summary(
    employer_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    employer = db.query(models.Employer).filter(models.Employer.id == employer_id).first()
    if not employer:
        raise HTTPException(status_code=404, detail="Employer not found")
    return summarize_employer_templates(db, employer, current_user)


@router.get("/employers/{employer_id}")
def get_employer(
    employer_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    employer = db.query(models.Employer).filter(models.Employer.id == employer_id).first()
    if not employer:
        raise HTTPException(status_code=404, detail="Employer not found")
    return _employer_to_dict(employer, summarize_employer_templates(db, employer, current_user))


@router.post("/employers")
async def create_employer(
    company_name: str = Form(...),
    country: str = Form(...),
    industry: str = Form(...),
    company_address: str = Form(...),
    company_city: str = Form(...),
    company_email: str = Form(...),
    hr_contact_name: str = Form(""),
    hr_contact_title: str = Form(""),
    hr_email: str = Form(""),
    signatory_name: str = Form(""),
    signatory_designation: str = Form(""),
    company_trading_name: str = Form(""),
    reg_number_label: str = Form(""),
    reg_number_value: str = Form(""),
    company_state: str = Form(""),
    company_postcode: str = Form(""),
    company_website: str = Form(""),
    employer_accreditation_no: str = Form(""),
    logo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    logo_path = None
    if logo and logo.filename:
        logo_path = await _save_logo(logo, company_name)

    employer = models.Employer(
        company_name=company_name.strip(),
        company_trading_name=company_trading_name.strip() or None,
        company_logo_path=logo_path,
        country=country.strip(),
        industry=industry.strip(),
        reg_number_label=reg_number_label.strip() or None,
        reg_number_value=reg_number_value.strip() or None,
        company_address=company_address.strip(),
        company_city=company_city.strip(),
        company_state=company_state.strip() or None,
        company_postcode=company_postcode.strip() or None,
        company_email=company_email.strip(),
        company_website=company_website.strip() or None,
        hr_contact_name=hr_contact_name.strip() or "",
        hr_contact_title=hr_contact_title.strip() or "",
        hr_email=hr_email.strip() or "",
        employer_accreditation_no=employer_accreditation_no.strip() or None,
        signatory_name=signatory_name.strip() or "",
        signatory_designation=signatory_designation.strip() or "",
    )
    db.add(employer)
    db.commit()
    db.refresh(employer)
    return _employer_to_dict(employer, summarize_employer_templates(db, employer, current_user))


@router.put("/employers/{employer_id}")
async def update_employer(
    employer_id: int,
    company_name: str = Form(...),
    country: str = Form(...),
    industry: str = Form(...),
    company_address: str = Form(...),
    company_city: str = Form(...),
    company_email: str = Form(...),
    hr_contact_name: str = Form(""),
    hr_contact_title: str = Form(""),
    hr_email: str = Form(""),
    signatory_name: str = Form(""),
    signatory_designation: str = Form(""),
    company_trading_name: str = Form(""),
    reg_number_label: str = Form(""),
    reg_number_value: str = Form(""),
    company_state: str = Form(""),
    company_postcode: str = Form(""),
    company_website: str = Form(""),
    employer_accreditation_no: str = Form(""),
    remove_logo: str = Form("false"),
    logo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    employer = db.query(models.Employer).filter(models.Employer.id == employer_id).first()
    if not employer:
        raise HTTPException(status_code=404, detail="Employer not found")

    if remove_logo.lower() == "true" and employer.company_logo_path:
        old_path = os.path.join(LOGO_DIR, employer.company_logo_path)
        if os.path.exists(old_path):
            os.unlink(old_path)
        employer.company_logo_path = None

    if logo and logo.filename:
        if employer.company_logo_path:
            old_path = os.path.join(LOGO_DIR, employer.company_logo_path)
            if os.path.exists(old_path):
                os.unlink(old_path)
        employer.company_logo_path = await _save_logo(logo, company_name)

    employer.company_name = company_name.strip()
    employer.company_trading_name = company_trading_name.strip() or None
    employer.country = country.strip()
    employer.industry = industry.strip()
    employer.reg_number_label = reg_number_label.strip() or None
    employer.reg_number_value = reg_number_value.strip() or None
    employer.company_address = company_address.strip()
    employer.company_city = company_city.strip()
    employer.company_state = company_state.strip() or None
    employer.company_postcode = company_postcode.strip() or None
    employer.company_email = company_email.strip()
    employer.company_website = company_website.strip() or None
    employer.hr_contact_name = hr_contact_name.strip() or ""
    employer.hr_contact_title = hr_contact_title.strip() or ""
    employer.hr_email = hr_email.strip() or ""
    employer.employer_accreditation_no = employer_accreditation_no.strip() or None
    employer.signatory_name = signatory_name.strip() or ""
    employer.signatory_designation = signatory_designation.strip() or ""
    employer.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(employer)
    return _employer_to_dict(employer, summarize_employer_templates(db, employer, current_user))


@router.delete("/employers/{employer_id}")
def delete_employer(
    employer_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    employer = db.query(models.Employer).filter(models.Employer.id == employer_id).first()
    if not employer:
        raise HTTPException(status_code=404, detail="Employer not found")
    if employer.company_logo_path:
        path = os.path.join(LOGO_DIR, employer.company_logo_path)
        if os.path.exists(path):
            os.unlink(path)
    db.delete(employer)
    db.commit()
    return {"ok": True}


@router.get("/employers/{employer_id}/logo")
def get_employer_logo(
    employer_id: int,
    db: Session = Depends(get_db),
):
    employer = db.query(models.Employer).filter(models.Employer.id == employer_id).first()
    if not employer or not employer.company_logo_path:
        raise HTTPException(status_code=404, detail="Logo not found")
    safe_name = safe_filename(employer.company_logo_path)
    path = safe_join(LOGO_DIR, safe_name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Logo file not found")
    ext = os.path.splitext(path)[1].lower()
    media = "image/png" if ext == ".png" else "image/jpeg"
    return FileResponse(path, media_type=media)

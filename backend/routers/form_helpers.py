import os
import re
import uuid
from datetime import datetime

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import get_db
from utils.file_utils import safe_filename, validate_logo_upload, safe_join

load_dotenv()

LOGO_DIR = os.getenv("LOGO_DIR", "./uploads/logos")

router = APIRouter(tags=["form-helpers"])


def logo_api_url(filename: str) -> str:
    return f"/api/uploads/logos/{filename}"


REF_NUMBER_START = 110369060


def _get_or_create_counter(db: Session) -> models.RefCounter:
    counter = db.query(models.RefCounter).filter(models.RefCounter.id == 1).first()
    if not counter:
        counter = models.RefCounter(
            id=1,
            last_number=REF_NUMBER_START - 1,
            updated_at=datetime.utcnow(),
        )
        db.add(counter)
        db.commit()
        db.refresh(counter)
    elif counter.last_number < REF_NUMBER_START - 1:
        counter.last_number = REF_NUMBER_START - 1
        counter.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(counter)
    return counter


def _format_ref_number(num: int) -> str:
    return f"OL-{num:010d}T"


@router.get("/ref-counter")
def peek_ref_counter(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    counter = _get_or_create_counter(db)
    next_num = counter.last_number + 1
    return {"next_number": next_num, "formatted": _format_ref_number(next_num)}


@router.post("/ref-counter/increment")
def increment_ref_counter(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    counter = _get_or_create_counter(db)
    counter.last_number += 1
    counter.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(counter)
    return {"number": counter.last_number, "formatted": _format_ref_number(counter.last_number)}


@router.get("/uploads/logos/{filename}")
def get_logo(
    filename: str,
    _: models.User = Depends(get_current_user),
):
    safe_name = safe_filename(filename)
    logo_path = safe_join(LOGO_DIR, safe_name)
    if not os.path.exists(logo_path):
        raise HTTPException(status_code=404, detail="Logo not found")
    ext = os.path.splitext(safe_name)[1].lower()
    media_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }
    return FileResponse(logo_path, media_type=media_types.get(ext, "application/octet-stream"))


@router.post("/logos")
async def upload_logo(
    company_name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    content = await file.read()
    validate_logo_upload(file.filename, file.content_type, len(content))

    logo_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename or "")[1].lower()
    safe_company = re.sub(r"[^\w\-]", "_", company_name.strip()) or "company"
    filename = f"{safe_company}_{logo_id}{ext}"
    os.makedirs(LOGO_DIR, exist_ok=True)
    path = os.path.join(LOGO_DIR, filename)
    with open(path, "wb") as f:
        f.write(content)

    logo = models.CompanyLogo(
        id=logo_id,
        company_name=company_name.strip(),
        filename=filename,
    )
    db.add(logo)
    db.commit()

    return {"logo_id": logo_id, "url": logo_api_url(filename)}


@router.get("/logos")
def list_logos(
    company_name: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    logos = (
        db.query(models.CompanyLogo)
        .filter(models.CompanyLogo.company_name == company_name.strip())
        .order_by(models.CompanyLogo.created_at.desc())
        .all()
    )
    return {
        "logos": [
            {
                "logo_id": logo.id,
                "url": logo_api_url(logo.filename),
                "filename": logo.filename,
            }
            for logo in logos
        ]
    }

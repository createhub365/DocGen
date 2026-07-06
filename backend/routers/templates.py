import json
import os

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import get_db
from schemas import TemplateFieldsResponse, PlaceholderSchema
from services.placeholder_extractor import extract_placeholders
from services.template_catalog import (
    build_trade_to_industry_map,
    country_names_match,
    format_label_from_filename,
    industries_match,
    resolve_template_industry,
)
from utils.file_utils import safe_join_relative

load_dotenv()
TEMPLATE_DIR = os.getenv("TEMPLATE_DIR", "./template_store")

router = APIRouter(tags=["templates"])


def _build_catalog_entry(
    t: models.Template,
    doc_type_obj,
    country_obj,
    trade_obj,
    company_obj,
    trade_to_industry: dict[str, str],
) -> dict:
    trade_name = trade_obj.name if trade_obj else None
    industry = resolve_template_industry(trade_name, t.category, trade_to_industry)
    country_name = country_obj.name if country_obj else None
    format_slug = t.format_slug or f"template-{t.id}"
    format_label = (
        t.format_label
        or format_label_from_filename(t.docx_filename)
        or f"Template #{t.id}"
    )

    return {
        "template_id": t.id,
        "doc_type": doc_type_obj.slug if doc_type_obj else None,
        "doc_type_name": doc_type_obj.name if doc_type_obj else None,
        "country": country_name,
        "country_id": t.country_id,
        "category": t.category,
        "industry": industry,
        "trade_name": trade_name,
        "company_name": company_obj.name if company_obj else None,
        "format_slug": format_slug,
        "format_label": format_label,
        "has_thumbnail": bool(t.thumbnail_path),
    }


@router.get("/templates")
def list_templates(
    doc_type: str | None = Query(None),
    country: str | None = Query(None),
    industry: str | None = Query(None, description="Industry name from trade bank"),
    category: str | None = Query(None, description="Legacy category alias for industry"),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    selected_industry = industry or category
    templates = db.query(models.Template).filter(models.Template.is_active == True).all()
    trade_to_industry = build_trade_to_industry_map()

    result = []
    for t in templates:
        doc_type_obj = (
            db.query(models.DocumentType)
            .filter(models.DocumentType.id == t.document_type_id)
            .first()
        )
        country_obj = db.query(models.Country).filter(models.Country.id == t.country_id).first()
        trade_obj = db.query(models.Trade).filter(models.Trade.id == t.trade_id).first()
        company_obj = db.query(models.Company).filter(models.Company.id == t.company_id).first()

        if doc_type and doc_type_obj and doc_type_obj.slug != doc_type:
            continue

        entry = _build_catalog_entry(t, doc_type_obj, country_obj, trade_obj, company_obj, trade_to_industry)

        if country and not country_names_match(country, entry["country"]):
            continue
        if selected_industry and not industries_match(
            selected_industry, entry["industry"], entry["category"]
        ):
            continue

        result.append(entry)

    countries = sorted({r["country"] for r in result if r["country"]})
    categories = sorted({r["category"] for r in result if r["category"]})
    industries = sorted({r["industry"] for r in result if r["industry"]})
    formats = [
        {
            "format_slug": r["format_slug"],
            "format_label": r["format_label"],
            "template_id": r["template_id"],
            "country": r["country"],
            "category": r["category"],
            "industry": r["industry"],
            "trade_name": r["trade_name"],
            "company_name": r["company_name"],
            "has_thumbnail": r["has_thumbnail"],
        }
        for r in result
    ]

    return {
        "templates": result,
        "countries": countries,
        "categories": categories,
        "industries": industries,
        "formats": formats,
    }


@router.get("/templates/{template_id}/thumbnail")
def get_template_thumbnail(
    template_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    template = (
        db.query(models.Template)
        .filter(models.Template.id == template_id, models.Template.is_active == True)
        .first()
    )
    if not template or not template.thumbnail_path:
        raise HTTPException(status_code=404, detail="No thumbnail available")

    thumb_path = safe_join_relative(TEMPLATE_DIR, template.thumbnail_path)
    if not os.path.exists(thumb_path):
        raise HTTPException(status_code=404, detail="Thumbnail file not found")

    return FileResponse(thumb_path, media_type="image/png")


@router.get("/template/{template_id}", response_model=TemplateFieldsResponse)
def get_template_by_id(
    template_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    template = (
        db.query(models.Template)
        .filter(models.Template.id == template_id, models.Template.is_active == True)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    docx_path = os.path.join(TEMPLATE_DIR, template.docx_filename)
    if not os.path.exists(docx_path):
        raise HTTPException(status_code=404, detail="Template file not found on disk")

    label_overrides = {}
    if template.label_overrides_json:
        try:
            label_overrides = json.loads(template.label_overrides_json)
        except json.JSONDecodeError:
            label_overrides = {}

    placeholders = extract_placeholders(docx_path, label_overrides)
    return TemplateFieldsResponse(
        template_id=template.id,
        placeholders=[PlaceholderSchema(**p) for p in placeholders],
    )


@router.get("/template", response_model=TemplateFieldsResponse)
def get_template(
    company_id: int = Query(...),
    trade_id: int = Query(...),
    country_id: int = Query(...),
    doc_type_id: int = Query(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    template = (
        db.query(models.Template)
        .filter(
            models.Template.company_id == company_id,
            models.Template.trade_id == trade_id,
            models.Template.country_id == country_id,
            models.Template.document_type_id == doc_type_id,
            models.Template.is_active == True,
        )
        .first()
    )
    if not template:
        raise HTTPException(
            status_code=404,
            detail="No template configured for this combination",
        )

    docx_path = os.path.join(TEMPLATE_DIR, template.docx_filename)
    if not os.path.exists(docx_path):
        raise HTTPException(status_code=404, detail="Template file not found on disk")

    label_overrides = {}
    if template.label_overrides_json:
        try:
            label_overrides = json.loads(template.label_overrides_json)
        except json.JSONDecodeError:
            label_overrides = {}

    placeholders = extract_placeholders(docx_path, label_overrides)
    return TemplateFieldsResponse(
        template_id=template.id,
        placeholders=[PlaceholderSchema(**p) for p in placeholders],
    )

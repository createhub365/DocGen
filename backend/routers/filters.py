from datetime import date, datetime, time as dt_time

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import get_db
from schemas import CountryResponse, TradeResponse, CompanyResponse, DocumentTypeResponse
from services.country_employer_config import (
    get_country_employer_config,
    get_country_employer_fields,
)
from services.employer_company_sync import list_companies_for_industry
from services.trade_bank_admin import get_merged_trade_bank

router = APIRouter(tags=["filters"])


@router.get("/dashboard/summary")
def dashboard_summary(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Dashboard counts. Document stats are per-user for staff; admins see all."""
    today = date.today()
    month_start = datetime.combine(today.replace(day=1), dt_time.min)

    active_templates = (
        db.query(models.Template).filter(models.Template.is_active == True).count()
    )
    countries_with_templates = (
        db.query(models.Template.country_id)
        .filter(models.Template.is_active == True)
        .distinct()
        .count()
    )

    doc_query = db.query(models.GeneratedDocument)
    month_query = db.query(models.GeneratedDocument).filter(
        models.GeneratedDocument.created_at >= month_start
    )
    if current_user.role != "admin":
        doc_query = doc_query.filter(models.GeneratedDocument.user_id == current_user.id)
        month_query = month_query.filter(models.GeneratedDocument.user_id == current_user.id)

    total_documents = doc_query.count()
    documents_this_month = month_query.count()

    total_trades = 0
    trade_categories = []
    try:
        bank = get_merged_trade_bank()
        total_trades = bank.get("meta", {}).get("total_trades", 0)
        for ind in bank.get("industries", []):
            for cat in ind.get("categories", []):
                name = cat.get("category") or ind.get("industry")
                if not name:
                    continue
                trade_categories.append({
                    "label": name,
                    "count": len(cat.get("trades", [])),
                })
        trade_categories.sort(key=lambda item: item["count"], reverse=True)
        trade_categories = trade_categories[:8]
    except Exception:
        total_trades = db.query(models.Trade).count()

    return {
        "active_templates": active_templates,
        "countries_with_templates": countries_with_templates,
        "total_trades": total_trades,
        "total_documents_generated": total_documents,
        "documents_this_month": documents_this_month,
        "trade_categories": trade_categories,
    }


@router.get("/countries", response_model=list[CountryResponse])
def get_countries(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    countries = db.query(models.Country).order_by(models.Country.name).all()
    return [CountryResponse(id=c.id, name=c.name, code=c.code) for c in countries]


@router.get("/trades", response_model=list[TradeResponse])
def get_trades(
    country_id: int = Query(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    trades = (
        db.query(models.Trade)
        .filter(models.Trade.country_id == country_id)
        .order_by(models.Trade.name)
        .all()
    )
    return [
        TradeResponse(id=t.id, name=t.name, country_id=t.country_id) for t in trades
    ]


@router.get("/companies/for-industry", response_model=list[CompanyResponse])
def get_companies_for_industry(
    country_id: int = Query(...),
    industry: str = Query(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    country = db.query(models.Country).filter(models.Country.id == country_id).first()
    if not country:
        return []

    synced = list_companies_for_industry(db, country, industry)
    result = []
    for company, trade in synced:
        has_template = (
            db.query(models.Template)
            .filter(
                models.Template.company_id == company.id,
                models.Template.trade_id == trade.id,
                models.Template.country_id == country_id,
                models.Template.is_active == True,
            )
            .first()
            is not None
        )
        result.append(
            CompanyResponse(
                id=company.id,
                name=company.name,
                has_template=has_template,
                trade_id=trade.id,
            )
        )
    return result


@router.get("/companies", response_model=list[CompanyResponse])
def get_companies(
    trade_id: int = Query(...),
    country_id: int = Query(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    companies = (
        db.query(models.Company)
        .filter(
            models.Company.trade_id == trade_id,
            models.Company.country_id == country_id,
        )
        .order_by(models.Company.name)
        .all()
    )
    result = []
    for company in companies:
        has_template = (
            db.query(models.Template)
            .filter(
                models.Template.company_id == company.id,
                models.Template.trade_id == trade_id,
                models.Template.country_id == country_id,
                models.Template.is_active == True,
            )
            .first()
            is not None
        )
        result.append(
            CompanyResponse(id=company.id, name=company.name, has_template=has_template)
        )
    return result


@router.get("/document-types", response_model=list[DocumentTypeResponse])
def get_document_types(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    doc_types = db.query(models.DocumentType).order_by(models.DocumentType.name).all()
    return [
        DocumentTypeResponse(id=d.id, name=d.name, slug=d.slug) for d in doc_types
    ]


@router.get("/employer-country-config")
def employer_country_config(
    _: models.User = Depends(get_current_user),
):
    """All employer form field configs keyed by country name."""
    return get_country_employer_config()


@router.get("/employer-country-config/{country_name}")
def employer_country_config_single(
    country_name: str,
    _: models.User = Depends(get_current_user),
):
    """Employer form field config for one country."""
    return get_country_employer_fields(country_name)

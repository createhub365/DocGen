"""Match active document templates to employer master records by company + country."""
from __future__ import annotations

from sqlalchemy.orm import Session

import models
from services.template_catalog import (
    build_trade_to_industry_map,
    country_names_match,
    format_label_from_filename,
    normalize_country_key,
    resolve_template_industry,
)


def _norm_company(name: str | None) -> str:
    return (name or "").strip().lower()


def _employer_company_keys(employer: models.Employer) -> set[str]:
    keys = {_norm_company(employer.company_name)}
    if employer.company_trading_name:
        keys.add(_norm_company(employer.company_trading_name))
    keys.discard("")
    return keys


def _template_entry(
    template: models.Template,
    *,
    doc_type_obj,
    country_obj,
    trade_obj,
    company_obj,
    trade_to_industry: dict[str, str],
) -> dict:
    trade_name = trade_obj.name if trade_obj else None
    industry = resolve_template_industry(trade_name, template.category, trade_to_industry)
    format_label = (
        template.format_label
        or format_label_from_filename(template.docx_filename)
        or f"Template #{template.id}"
    )
    return {
        "template_id": template.id,
        "doc_type_name": doc_type_obj.name if doc_type_obj else None,
        "doc_type_slug": doc_type_obj.slug if doc_type_obj else None,
        "format_label": format_label,
        "format_slug": template.format_slug or f"template-{template.id}",
        "industry": industry,
        "category": template.category,
        "trade_name": trade_name,
        "country": country_obj.name if country_obj else None,
    }


def _build_template_index(db: Session) -> list[tuple[set[str], str | None, dict]]:
    templates = db.query(models.Template).filter(models.Template.is_active == True).all()
    trade_to_industry = build_trade_to_industry_map()
    indexed: list[tuple[set[str], str | None, dict]] = []

    for template in templates:
        company_obj = (
            db.query(models.Company).filter(models.Company.id == template.company_id).first()
        )
        if not company_obj:
            continue
        country_obj = (
            db.query(models.Country).filter(models.Country.id == template.country_id).first()
        )
        trade_obj = db.query(models.Trade).filter(models.Trade.id == template.trade_id).first()
        doc_type_obj = (
            db.query(models.DocumentType)
            .filter(models.DocumentType.id == template.document_type_id)
            .first()
        )
        entry = _template_entry(
            template,
            doc_type_obj=doc_type_obj,
            country_obj=country_obj,
            trade_obj=trade_obj,
            company_obj=company_obj,
            trade_to_industry=trade_to_industry,
        )
        company_keys = {_norm_company(company_obj.name)}
        country_key = country_obj.name if country_obj else None
        indexed.append((company_keys, country_key, entry))

    return indexed


def templates_for_employer(db: Session, employer: models.Employer) -> list[dict]:
    employer_keys = _employer_company_keys(employer)
    if not employer_keys:
        return []

    indexed = _build_template_index(db)
    matches: list[dict] = []
    seen_ids: set[int] = set()

    for company_keys, country_key, entry in indexed:
        if not employer_keys.intersection(company_keys):
            continue
        if not country_names_match(employer.country, country_key):
            continue
        tid = entry["template_id"]
        if tid in seen_ids:
            continue
        seen_ids.add(tid)
        matches.append(entry)

    matches.sort(key=lambda item: (item.get("industry") or "", item.get("format_label") or ""))
    return matches


def _documents_issued_for_employer(
    db: Session,
    employer: models.Employer,
    current_user: models.User | None = None,
) -> int:
    """Count generated docs for this employer. Staff see only their own (same as dashboard)."""
    query = db.query(models.GeneratedDocument).filter(
        models.GeneratedDocument.form_data_json.contains(f'"{employer.company_name}"')
    )
    if current_user and current_user.role != "admin":
        query = query.filter(models.GeneratedDocument.user_id == current_user.id)
    return query.count()


def summarize_employer_templates(
    db: Session,
    employer: models.Employer,
    current_user: models.User | None = None,
) -> dict:
    templates = templates_for_employer(db, employer)
    industries = sorted({t["industry"] for t in templates if t.get("industry")})
    doc_types = sorted({t["doc_type_name"] for t in templates if t.get("doc_type_name")})

    documents_issued = _documents_issued_for_employer(db, employer, current_user)

    return {
        "template_count": len(templates),
        "documents_issued": documents_issued,
        "industries": industries,
        "doc_types": doc_types,
        "templates": templates,
    }


def summarize_all_employers(
    db: Session,
    employers: list[models.Employer],
    current_user: models.User | None = None,
) -> dict[int, dict]:
    if not employers:
        return {}

    indexed = _build_template_index(db)
    summaries: dict[int, dict] = {}

    for employer in employers:
        employer_keys = _employer_company_keys(employer)
        matches: list[dict] = []
        seen_ids: set[int] = set()
        for company_keys, country_key, entry in indexed:
            if not employer_keys.intersection(company_keys):
                continue
            if not country_names_match(employer.country, country_key):
                continue
            tid = entry["template_id"]
            if tid in seen_ids:
                continue
            seen_ids.add(tid)
            matches.append(entry)
        matches.sort(key=lambda item: (item.get("industry") or "", item.get("format_label") or ""))
        industries = sorted({t["industry"] for t in matches if t.get("industry")})
        documents_issued = _documents_issued_for_employer(db, employer, current_user)
        summaries[employer.id] = {
            "template_count": len(matches),
            "documents_issued": documents_issued,
            "industries": industries,
            "doc_types": sorted({t["doc_type_name"] for t in matches if t.get("doc_type_name")}),
            "templates": matches,
        }

    return summaries


def attach_template_summaries(
    db: Session,
    employers: list[models.Employer],
    current_user: models.User | None = None,
) -> None:
    summaries = summarize_all_employers(db, employers, current_user)
    for employer in employers:
        employer._template_summary = summaries.get(
            employer.id,
            {
                "template_count": 0,
                "documents_issued": 0,
                "industries": [],
                "doc_types": [],
                "templates": [],
            },
        )

"""Sync employer master records into template filter tables (trades + companies)."""

import re

import models

_COUNTRY_ALIASES = {
    "uk": "united kingdom",
    "gb": "united kingdom",
    "uae": "united arab emirates",
    "ae": "united arab emirates",
}


def normalize_industry(name: str | None) -> str:
    if not name:
        return ""
    return (
        name.replace("&", " and ")
        .replace("  ", " ")
        .strip()
        .lower()
    )


def _normalize_country(name: str | None) -> str:
    if not name:
        return ""
    value = name.strip().lower()
    return _COUNTRY_ALIASES.get(value, value)


def country_record_matches(employer_country: str, country: models.Country) -> bool:
    employer_key = _normalize_country(employer_country)
    if not employer_key:
        return False
    db_keys = {
        _normalize_country(country.name),
        _normalize_country(country.code),
    }
    return employer_key in db_keys


def find_country_for_employer(db, employer_country: str) -> models.Country | None:
    countries = db.query(models.Country).all()
    for country in countries:
        if country_record_matches(employer_country, country):
            return country
    return None


def sync_employer_to_company(db, employer: models.Employer) -> tuple[models.Company, models.Trade] | None:
    country = find_country_for_employer(db, employer.country)
    industry = (employer.industry or "").strip()
    company_name = (employer.company_name or "").strip()
    if not country or not industry or not company_name:
        return None

    trade = (
        db.query(models.Trade)
        .filter(
            models.Trade.country_id == country.id,
            models.Trade.name == industry,
        )
        .first()
    )
    if not trade:
        trade = models.Trade(name=industry, country_id=country.id)
        db.add(trade)
        db.flush()

    company = (
        db.query(models.Company)
        .filter(
            models.Company.country_id == country.id,
            models.Company.trade_id == trade.id,
            models.Company.name == company_name,
        )
        .first()
    )
    if not company:
        company = models.Company(
            name=company_name,
            trade_id=trade.id,
            country_id=country.id,
        )
        db.add(company)
        db.flush()
    else:
        company.name = company_name

    return company, trade


def list_companies_for_industry(db, country: models.Country, industry: str) -> list[tuple[models.Company, models.Trade]]:
    target = normalize_industry(industry)
    if not target:
        return []

    matched: list[tuple[models.Company, models.Trade]] = []
    employers = db.query(models.Employer).order_by(models.Employer.company_name).all()
    for employer in employers:
        if not country_record_matches(employer.country, country):
            continue
        if normalize_industry(employer.industry) != target:
            continue
        synced = sync_employer_to_company(db, employer)
        if synced:
            matched.append(synced)

    db.commit()
    deduped: dict[int, tuple[models.Company, models.Trade]] = {}
    for company, trade in matched:
        deduped[company.id] = (company, trade)
    return sorted(deduped.values(), key=lambda item: item[0].name.lower())

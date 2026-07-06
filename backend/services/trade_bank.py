import json
import os
from functools import lru_cache
from typing import Any

from services.occupation_codes import normalize_trade_entry, resolve_country_code
from utils.duty_resolver import resolve_duties

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "nz_trade_duties_bank.json")
CATALOG_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "nz_trade_bank_catalog.json")
COMPLETE_BANK_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "complete_trade_bank.json")

COUNTRY_ALIASES = {
    "newzealand": "New Zealand",
    "new zealand": "New Zealand",
    "nz": "New Zealand",
    "australia": "Australia",
    "au": "Australia",
    "united kingdom": "United Kingdom",
    "uk": "United Kingdom",
    "canada": "Canada",
    "uae": "UAE",
    "jordan": "Jordan",
}

COUNTRY_REG_PLACEHOLDER = {
    "New Zealand": "company_nzbn",
    "Australia": "company_abn",
    "United Kingdom": "company_crn",
    "Canada": "company_bn",
    "UAE": "company_trn",
}


def _catalog_to_country_entries(catalog: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    for cat in catalog.get("categories", []):
        cat_name = cat["category"]
        result[cat_name] = [
            normalize_trade_entry({
                "trade_name": trade["trade"],
                "anzsco_code": trade.get("anzsco_code", ""),
                "anzsco_title": trade.get("anzsco_title", ""),
                "occupation_codes": trade.get("occupation_codes"),
                "duties": trade.get("duties", []),
            })
            for trade in cat.get("trades", [])
        ]
    return result


@lru_cache(maxsize=1)
def _load_complete_bank() -> dict[str, Any]:
    if not os.path.exists(COMPLETE_BANK_PATH):
        return {"industries": []}
    with open(COMPLETE_BANK_PATH, encoding="utf-8") as f:
        return json.load(f)


def _find_in_complete_bank(trade: str, category: str | None = None) -> dict[str, Any] | None:
    target = trade.strip().lower()
    bank = _load_complete_bank()
    for industry in bank.get("industries", []):
        for cat in industry.get("categories", []):
            if category and cat.get("category", "").lower() != category.strip().lower():
                continue
            for entry in cat.get("trades", []):
                trade_name = (entry.get("trade") or entry.get("trade_name") or "").strip()
                if trade_name.lower() == target:
                    normalized = normalize_trade_entry(entry)
                    normalized["trade_name"] = trade_name
                    normalized["category"] = cat.get("category", "General")
                    normalized["industry"] = industry.get("industry")
                    return normalized
    return None


def _entry_with_resolved_duties(entry: dict[str, Any], country: str) -> dict[str, Any]:
    country_code = resolve_country_code(country) or "NZ"
    result = dict(entry)
    result["duties"] = resolve_duties(entry, country_code)
    return result
def _list_from_complete_bank(
    country: str,
    category: str | None = None,
) -> list[dict[str, Any]]:
    """Fallback trade list from global complete_trade_bank.json."""
    bank = _load_complete_bank()
    result: list[dict[str, Any]] = []
    for industry in bank.get("industries", []):
        for cat in industry.get("categories", []):
            cat_name = cat.get("category") or "General"
            if category and cat_name.lower() != category.strip().lower():
                continue
            for entry in cat.get("trades", []):
                trade_name = (entry.get("trade") or entry.get("trade_name") or "").strip()
                if not trade_name:
                    continue
                normalized = normalize_trade_entry(entry)
                duties = resolve_duties(normalized, resolve_country_code(country) or "")
                result.append(
                    {
                        "trade_name": trade_name,
                        "anzsco_code": normalized.get("anzsco_code", ""),
                        "anzsco_title": normalized.get("anzsco_title", ""),
                        "occupation_codes": normalized.get("occupation_codes", {}),
                        "category": cat_name,
                        "industry": industry.get("industry"),
                        "duty_count": len(duties),
                    }
                )
    return result


def _categories_from_complete_bank() -> list[str]:
    bank = _load_complete_bank()
    categories: set[str] = set()
    for industry in bank.get("industries", []):
        for cat in industry.get("categories", []):
            name = cat.get("category")
            if name:
                categories.add(name)
    return sorted(categories)


@lru_cache(maxsize=1)
def _load_bank() -> dict[str, Any]:
    with open(DATA_PATH, encoding="utf-8") as f:
        bank = json.load(f)

    if os.path.exists(CATALOG_PATH):
        with open(CATALOG_PATH, encoding="utf-8") as f:
            catalog = json.load(f)
        bank["New Zealand"] = _catalog_to_country_entries(catalog)

    return bank


def normalize_country(country: str) -> str:
    key = country.strip().lower().replace("_", " ")
    return COUNTRY_ALIASES.get(key, country.strip())


def list_categories(country: str) -> list[str]:
    bank = _load_bank()
    country_key = normalize_country(country)
    categories = list(bank.get(country_key, {}).keys())
    if categories:
        return categories
    return _categories_from_complete_bank()


def list_trades(country: str, category: str | None = None) -> list[dict[str, Any]]:
    bank = _load_bank()
    country_key = normalize_country(country)
    country_data = bank.get(country_key, {})
    if not country_data:
        return _list_from_complete_bank(country, category)

    if category:
        trades = country_data.get(category, [])
        return [
            {
                "trade_name": t["trade_name"],
                "anzsco_code": t.get("anzsco_code", ""),
                "anzsco_title": t.get("anzsco_title", ""),
                "occupation_codes": t.get("occupation_codes", {}),
                "duty_count": len(t.get("duties", [])),
            }
            for t in trades
        ]
    result = []
    for cat, trades in country_data.items():
        for t in trades:
            result.append(
                {
                    "trade_name": t["trade_name"],
                    "anzsco_code": t.get("anzsco_code", ""),
                    "anzsco_title": t.get("anzsco_title", ""),
                    "occupation_codes": t.get("occupation_codes", {}),
                    "category": cat,
                    "duty_count": len(t.get("duties", [])),
                }
            )
    return result


def get_trade_details(country: str, trade: str, category: str | None = None) -> dict[str, Any] | None:
    bank = _load_bank()
    country_key = normalize_country(country)
    country_data = bank.get(country_key, {})
    categories = [category] if category else list(country_data.keys())
    for cat in categories:
        for entry in country_data.get(cat, []):
            if entry["trade_name"].lower() == trade.strip().lower():
                normalized = normalize_trade_entry(entry)
                return _entry_with_resolved_duties(
                    {
                        "trade_name": normalized["trade_name"],
                        "anzsco_code": normalized.get("anzsco_code", ""),
                        "anzsco_title": normalized.get("anzsco_title", ""),
                        "occupation_codes": normalized.get("occupation_codes", {}),
                        "category": cat,
                        "duties_generic": normalized.get("duties_generic", []),
                        "duties_by_country": normalized.get("duties_by_country", {}),
                        "duties": normalized.get("duties", []),
                    },
                    country,
                )

    complete_entry = _find_in_complete_bank(trade, category)
    if complete_entry:
        return _entry_with_resolved_duties(
            {
                "trade_name": complete_entry["trade_name"],
                "anzsco_code": complete_entry.get("anzsco_code", ""),
                "anzsco_title": complete_entry.get("anzsco_title", ""),
                "occupation_codes": complete_entry.get("occupation_codes", {}),
                "category": complete_entry.get("category", category or "General"),
                "duties_generic": complete_entry.get("duties_generic", []),
                "duties_by_country": complete_entry.get("duties_by_country", {}),
                "duties": complete_entry.get("duties", []),
            },
            country,
        )
    return None


def format_duties_for_docx(duties: list[str]) -> str:
    return "\n".join(f"• {duty}" for duty in duties)

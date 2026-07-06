"""Resolve template industry/country for wizard catalog filtering."""
from __future__ import annotations

import os
import re

from services.trade_bank_admin import get_merged_trade_bank

INDUSTRY_CATEGORY_ALIASES: dict[str, list[str]] = {
    "construction & infrastructure": ["construction and infrastructure"],
    "hospitality & tourism": ["hotels & hospitality", "hotels and hospitality"],
    "logistics & supply chain": ["warehousing"],
}

COUNTRY_NAME_ALIASES: dict[str, set[str]] = {
    "new zealand": {"new zealand", "nz"},
    "australia": {"australia", "au"},
    "united kingdom": {"united kingdom", "uk", "great britain"},
    "canada": {"canada", "ca"},
    "united arab emirates": {"united arab emirates", "uae"},
    "jordan": {"jordan", "jo"},
    "saudi arabia": {"saudi arabia", "sa"},
    "india": {"india", "in"},
}


def normalize_industry_key(name: str | None) -> str:
    if not name:
        return ""
    return re.sub(r"\s*&\s*", " and ", name.strip()).lower()


def normalize_country_key(name: str | None) -> str:
    if not name:
        return ""
    return name.strip().lower()


def country_names_match(selected: str | None, template_country: str | None) -> bool:
    if not selected:
        return True
    if not template_country:
        return False
    sel = normalize_country_key(selected)
    tpl = normalize_country_key(template_country)
    if sel == tpl:
        return True
    for variants in COUNTRY_NAME_ALIASES.values():
        if sel in variants and tpl in variants:
            return True
    return False


def industries_match(
    selected_industry: str | None,
    template_industry: str | None,
    template_category: str | None = None,
) -> bool:
    if not selected_industry:
        return True

    sel = normalize_industry_key(selected_industry)
    candidates = [template_industry, template_category]
    for candidate in candidates:
        if not candidate:
            continue
        cand = normalize_industry_key(candidate)
        if sel == cand:
            return True
        aliases = INDUSTRY_CATEGORY_ALIASES.get(sel, [])
        if any(normalize_industry_key(alias) == cand for alias in aliases):
            return True
    return False


def build_trade_to_industry_map() -> dict[str, str]:
    bank = get_merged_trade_bank()
    mapping: dict[str, str] = {}
    for ind in bank.get("industries", []):
        industry_name = ind.get("industry", "")
        if not industry_name:
            continue
        for cat in ind.get("categories", []):
            for trade in cat.get("trades", []):
                trade_name = (trade.get("trade") or trade.get("trade_name") or "").strip().lower()
                if trade_name and trade_name not in mapping:
                    mapping[trade_name] = industry_name
    return mapping


def resolve_template_industry(
    trade_name: str | None,
    category: str | None,
    trade_to_industry: dict[str, str] | None = None,
) -> str | None:
    if category:
        return category
    if not trade_name:
        return None

    mapping = trade_to_industry if trade_to_industry is not None else build_trade_to_industry_map()
    key = trade_name.strip().lower()
    if key in mapping:
        return mapping[key]

    for trade_key, industry in mapping.items():
        if key in trade_key or trade_key in key:
            return industry
    return None


def format_label_from_filename(filename: str | None) -> str:
    if not filename:
        return ""
    base = os.path.splitext(os.path.basename(filename))[0]
    cleaned = re.sub(r"[_-]+", " ", base).strip()
    if not cleaned:
        return ""
    return cleaned.title()

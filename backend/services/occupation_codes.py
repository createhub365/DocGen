"""Occupation code systems per country (ANZSCO, NOC, SOC, ISCO, etc.)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
MAPPINGS_PATH = DATA_DIR / "trade_occupation_codes.json"

SYSTEM_REMAP = {"ISCO08": "ISCO"}

# Bank trade label -> mapping trade_name in trade_occupation_codes.json
BANK_TRADE_ALIASES: dict[str, str] = {
    "Shearing / Shearer": "Shearer",
    "Pharmaceutical Production": "Pharmaceutical Production Worker",
    "Business Intelligence": "Business Intelligence Analyst",
    "Electronics Sales": "Electronics Sales Specialist",
    "Fashion Retail": "Fashion Retail Specialist",
    "Solar Installer": "Solar / Renewable Energy Installer",
}

COUNTRY_TO_SYSTEM: dict[str, str] = {
    "NZ": "ANZSCO",
    "AU": "ANZSCO",
    "GB": "SOC_UK",
    "CA": "NOC",
    "US": "SOC",
    "IN": "NCO",
    "AE": "UAE_MOL",
    "SA": "KSA_MOL",
    "QA": "QATAR_MOI",
    "KW": "KUWAIT_MOI",
    "OM": "OMAN_MOL",
    "BH": "BAHRAIN_LMRA",
    "SG": "SSOC",
    "JO": "ISCO",
}

COUNTRY_NAME_TO_CODE: dict[str, str] = {
    "new zealand": "NZ",
    "nz": "NZ",
    "australia": "AU",
    "au": "AU",
    "united kingdom": "GB",
    "uk": "GB",
    "great britain": "GB",
    "canada": "CA",
    "ca": "CA",
    "united states": "US",
    "usa": "US",
    "us": "US",
    "india": "IN",
    "in": "IN",
    "uae": "AE",
    "united arab emirates": "AE",
    "saudi arabia": "SA",
    "sa": "SA",
    "qatar": "QA",
    "qa": "QA",
    "kuwait": "KW",
    "kw": "KW",
    "jordan": "JO",
    "jo": "JO",
    "oman": "OM",
    "om": "OM",
    "bahrain": "BH",
    "bh": "BH",
    "singapore": "SG",
    "sg": "SG",
}

SYSTEM_LABELS: dict[str, str] = {
    "ANZSCO": "ANZSCO",
    "SOC": "SOC",
    "SOC_UK": "SOC 2020",
    "NOC": "NOC 2021",
    "ISCO": "ISCO-08",
    "NCO": "NCO 2015",
    "UAE_MOL": "UAE MOL",
    "KSA_MOL": "KSA MOL",
    "QATAR_MOI": "Qatar MOI",
    "KUWAIT_MOI": "Kuwait MOI",
    "OMAN_MOL": "Oman MOL",
    "BAHRAIN_LMRA": "Bahrain LMRA",
    "SSOC": "SSOC 2020",
}


def resolve_country_code(country: str | None) -> str:
    if not country:
        return ""
    raw = country.strip()
    if len(raw) == 2 and raw.upper() in COUNTRY_TO_SYSTEM:
        return raw.upper()
    return COUNTRY_NAME_TO_CODE.get(raw.lower(), "")


def normalize_occupation_codes(trade: dict[str, Any]) -> dict[str, dict[str, str]]:
    codes: dict[str, dict[str, str]] = dict(trade.get("occupation_codes") or {})
    trade_name = trade.get("trade") or trade.get("trade_name") or ""
    if "ANZSCO" not in codes and trade.get("anzsco_code"):
        codes["ANZSCO"] = {
            "code": str(trade["anzsco_code"]),
            "title": str(trade.get("anzsco_title") or trade_name),
        }
    return codes


def normalize_trade_entry(trade: dict[str, Any]) -> dict[str, Any]:
    entry = apply_occupation_code_mappings(trade)
    codes = normalize_occupation_codes(entry)
    entry = dict(entry)
    entry["occupation_codes"] = codes
    anzsco = codes.get("ANZSCO", {})
    entry["anzsco_code"] = anzsco.get("code") or trade.get("anzsco_code", "")
    entry["anzsco_title"] = anzsco.get("title") or trade.get("anzsco_title", "")
    if entry.get("duties_by_country") is None:
        entry["duties_by_country"] = {}
    return entry


def get_occupation_code(trade: dict[str, Any], country_code: str) -> dict[str, str]:
    system = COUNTRY_TO_SYSTEM.get((country_code or "").upper(), "ISCO")
    codes = normalize_occupation_codes(trade)
    code_info = codes.get(system, {})
    trade_name = trade.get("trade") or trade.get("trade_name") or ""
    return {
        "system": SYSTEM_LABELS.get(system, system),
        "code": code_info.get("code", "N/A"),
        "title": code_info.get("title", trade_name),
    }


def get_occupation_code_for_country_name(trade: dict[str, Any], country: str | None) -> dict[str, str]:
    return get_occupation_code(trade, resolve_country_code(country))


def sanitize_occupation_codes_payload(
    raw: dict[str, Any] | None, trade_name: str, legacy_anzsco: str | None = None, legacy_title: str | None = None
) -> dict[str, dict[str, str]]:
    codes: dict[str, dict[str, str]] = {}
    if raw:
        for system, info in raw.items():
            if not isinstance(info, dict):
                continue
            code = str(info.get("code") or "").strip()
            if not code:
                continue
            title = str(info.get("title") or trade_name).strip() or trade_name
            entry: dict[str, str] = {"code": code, "title": title}
            confidence = str(info.get("confidence") or "").strip()
            note = str(info.get("note") or "").strip()
            if confidence:
                entry["confidence"] = confidence
            if note:
                entry["note"] = note
            codes[str(system).strip()] = entry
    if legacy_anzsco and "ANZSCO" not in codes:
        codes["ANZSCO"] = {
            "code": legacy_anzsco.strip(),
            "title": (legacy_title or trade_name).strip() or trade_name,
        }
    return codes


@lru_cache(maxsize=1)
def _load_occupation_code_mappings() -> dict[str, dict[str, dict[str, str]]]:
    if not MAPPINGS_PATH.exists():
        return {}
    with open(MAPPINGS_PATH, encoding="utf-8") as f:
        payload = json.load(f)
    result: dict[str, dict[str, dict[str, str]]] = {}
    for item in payload:
        trade_name = (item.get("trade_name") or "").strip()
        raw_codes = item.get("codes") or {}
        if not trade_name or not raw_codes:
            continue
        normalized: dict[str, dict[str, str]] = {}
        for system, info in raw_codes.items():
            if not isinstance(info, dict):
                continue
            key = SYSTEM_REMAP.get(system, system)
            code = str(info.get("code") or "").strip()
            if not code:
                continue
            entry = {
                "code": code,
                "title": str(info.get("title") or trade_name).strip() or trade_name,
            }
            confidence = str(info.get("confidence") or "").strip()
            note = str(info.get("note") or "").strip()
            if confidence:
                entry["confidence"] = confidence
            if note:
                entry["note"] = note
            normalized[key] = entry
        if normalized:
            result[trade_name] = normalized
    return result


def _mapping_lookup(trade_name: str, mappings: dict[str, dict[str, dict[str, str]]]) -> dict[str, dict[str, str]] | None:
    name = (trade_name or "").strip()
    if not name:
        return None
    if name in mappings:
        return mappings[name]
    alias = BANK_TRADE_ALIASES.get(name)
    if alias and alias in mappings:
        return mappings[alias]
    return None


def apply_occupation_code_mappings(trade: dict[str, Any]) -> dict[str, Any]:
    mappings = _load_occupation_code_mappings()
    trade_name = trade.get("trade") or trade.get("trade_name") or ""
    mapped = _mapping_lookup(trade_name, mappings)
    if not mapped:
        return trade
    entry = dict(trade)
    entry["occupation_codes"] = mapped
    anzsco = mapped.get("ANZSCO", {})
    if anzsco.get("code"):
        entry["anzsco_code"] = anzsco["code"]
    if anzsco.get("title"):
        entry["anzsco_title"] = anzsco["title"]
    return entry

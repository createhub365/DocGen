"""Admin trade bank: merge built-in catalog with custom trades."""
from __future__ import annotations

import copy
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from services.occupation_codes import (
    normalize_trade_entry,
    sanitize_occupation_codes_payload,
)
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
BUILTIN_PATH = DATA_DIR / "complete_trade_bank.json"
CUSTOM_PATH = DATA_DIR / "custom_trade_bank.json"

DEFAULT_CUSTOM_INDUSTRY_ICON = "✨"
DEFAULT_CUSTOM_INDUSTRY_COLOR = "#7D6608"
DEFAULT_CATEGORY = "General"


def _load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _save_custom(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(CUSTOM_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _load_custom() -> dict:
    if not CUSTOM_PATH.exists():
        return {"industries": [], "trades": []}
    data = _load_json(CUSTOM_PATH)
    data.setdefault("industries", [])
    data.setdefault("trades", [])
    return data


def _count_trades(industries: list[dict]) -> int:
    return sum(
        len(cat["trades"])
        for ind in industries
        for cat in ind.get("categories", [])
    )


def _mark_builtin(industries: list[dict]) -> None:
    for ind in industries:
        ind.setdefault("is_custom", False)
        for cat in ind.get("categories", []):
            for trade in cat.get("trades", []):
                trade["is_custom"] = False
                trade.pop("id", None)


def _find_industry(industries: list[dict], name: str) -> dict | None:
    for ind in industries:
        if ind["industry"].lower() == name.lower():
            return ind
    return None


def _find_category(industry: dict, name: str) -> dict | None:
    for cat in industry.get("categories", []):
        if cat["category"].lower() == name.lower():
            return cat
    return None


def _merge_custom_into(industries: list[dict], custom_records: list[dict]) -> None:
    for record in custom_records:
        industry_name = record["industry"]
        category_name = record.get("category") or DEFAULT_CATEGORY
        industry = _find_industry(industries, industry_name)
        if not industry:
            industry = {
                "industry": industry_name,
                "icon": record.get("industry_icon") or DEFAULT_CUSTOM_INDUSTRY_ICON,
                "color": record.get("industry_color") or DEFAULT_CUSTOM_INDUSTRY_COLOR,
                "categories": [],
                "is_custom": True,
            }
            industries.append(industry)
        category = _find_category(industry, category_name)
        if not category:
            category = {"category": category_name, "trades": []}
            industry["categories"].append(category)
        trade_entry = normalize_trade_entry({
            "id": record["id"],
            "trade": record["trade"],
            "occupation_codes": record.get("occupation_codes"),
            "anzsco_code": record.get("anzsco_code"),
            "anzsco_title": record.get("anzsco_title"),
            "responsibilities": record.get("responsibilities") or [],
            "duties_generic": record.get("duties_generic") or record.get("duties") or [],
            "duties_by_country": record.get("duties_by_country") or {},
            "duties": record.get("duties") or [],
            "is_custom": True,
        })
        category["trades"].append(trade_entry)


def _merge_custom_industries(industries: list[dict], custom_industries: list[dict]) -> None:
    for record in custom_industries:
        name = record.get("industry", "").strip()
        if not name or _find_industry(industries, name):
            continue
        industries.append({
            "id": record.get("id"),
            "industry": name,
            "icon": record.get("icon") or DEFAULT_CUSTOM_INDUSTRY_ICON,
            "color": record.get("color") or DEFAULT_CUSTOM_INDUSTRY_COLOR,
            "categories": [{"category": DEFAULT_CATEGORY, "trades": []}],
            "is_custom": True,
        })


def _normalize_global_industries(industries: list[dict]) -> None:
    """Industries and trades are global; only occupation codes vary by country."""
    for ind in industries:
        ind.pop("countries", None)


def get_merged_trade_bank() -> dict:
    if not BUILTIN_PATH.exists():
        raise HTTPException(status_code=404, detail="Trade bank file not found")
    payload = _load_json(BUILTIN_PATH)
    industries = copy.deepcopy(payload.get("industries", []))
    _mark_builtin(industries)
    custom = _load_custom()
    _merge_custom_industries(industries, custom.get("industries", []))
    _merge_custom_into(industries, custom.get("trades", []))
    _normalize_global_industries(industries)
    for ind in industries:
        for cat in ind.get("categories", []):
            cat["trades"] = [normalize_trade_entry(t) for t in cat.get("trades", [])]
    industries.sort(key=lambda i: (not i.get("is_custom"), i["industry"].lower()))
    total = _count_trades(industries)
    return {
        "meta": {
            **payload.get("meta", {}),
            "total_industries": len(industries),
            "total_trades": total,
            "custom_trades": len(custom.get("trades", [])),
            "custom_industries": len(custom.get("industries", [])),
        },
        "industries": industries,
    }


def _industry_exists(name: str, industries: list[dict]) -> bool:
    return _find_industry(industries, name) is not None


def create_custom_industry(body: dict) -> dict:
    name = (body.get("industry") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Industry name is required")

    if not BUILTIN_PATH.exists():
        raise HTTPException(status_code=404, detail="Trade bank file not found")
    builtin = _load_json(BUILTIN_PATH).get("industries", [])
    if _industry_exists(name, builtin):
        raise HTTPException(status_code=400, detail="Industry already exists")

    custom = _load_custom()
    if any(i.get("industry", "").lower() == name.lower() for i in custom.get("industries", [])):
        raise HTTPException(status_code=400, detail="Custom industry already exists")
    if any(t.get("industry", "").lower() == name.lower() for t in custom.get("trades", [])):
        raise HTTPException(status_code=400, detail="Industry already exists via custom trades")

    record = {
        "id": str(uuid.uuid4()),
        "industry": name,
        "icon": (body.get("icon") or DEFAULT_CUSTOM_INDUSTRY_ICON).strip(),
        "color": (body.get("color") or DEFAULT_CUSTOM_INDUSTRY_COLOR).strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    custom.setdefault("industries", []).append(record)
    _save_custom(custom)
    return record


def create_custom_trade(body: dict) -> dict:
    industry = (body.get("industry") or "").strip()
    trade_name = (body.get("trade") or "").strip()
    occupation_codes = sanitize_occupation_codes_payload(
        body.get("occupation_codes"),
        trade_name,
        body.get("anzsco_code"),
        body.get("anzsco_title"),
    )
    if not industry or not trade_name:
        raise HTTPException(status_code=400, detail="Industry and trade name are required")
    if not occupation_codes:
        raise HTTPException(status_code=400, detail="At least one occupation code is required")
    responsibilities = [r.strip() for r in body.get("responsibilities") or [] if r and r.strip()]
    generic_duties = [d.strip() for d in body.get("duties_generic") or body.get("duties") or [] if d and d.strip()]
    if not responsibilities:
        raise HTTPException(status_code=400, detail="At least one responsibility is required")
    if not generic_duties:
        raise HTTPException(status_code=400, detail="At least one duty is required")

    custom = _load_custom()
    record = {
        "id": str(uuid.uuid4()),
        "industry": industry,
        "industry_icon": body.get("industry_icon") or DEFAULT_CUSTOM_INDUSTRY_ICON,
        "industry_color": body.get("industry_color") or DEFAULT_CUSTOM_INDUSTRY_COLOR,
        "category": (body.get("category") or DEFAULT_CATEGORY).strip(),
        "trade": trade_name,
        "occupation_codes": occupation_codes,
        "anzsco_code": occupation_codes.get("ANZSCO", {}).get("code", ""),
        "anzsco_title": occupation_codes.get("ANZSCO", {}).get("title", trade_name),
        "responsibilities": responsibilities,
        "duties_generic": generic_duties,
        "duties_by_country": {},
        "duties": generic_duties,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    custom.setdefault("trades", []).append(record)
    _save_custom(custom)
    return record


def update_custom_trade(trade_id: str, body: dict) -> dict:
    custom = _load_custom()
    trades = custom.get("trades", [])
    idx = next((i for i, t in enumerate(trades) if t["id"] == trade_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Custom trade not found")

    record = trades[idx]
    if "industry" in body and body["industry"]:
        record["industry"] = body["industry"].strip()
    if "category" in body and body["category"]:
        record["category"] = body["category"].strip()
    if "trade" in body and body["trade"]:
        record["trade"] = body["trade"].strip()
    if "occupation_codes" in body or "anzsco_code" in body:
        codes = sanitize_occupation_codes_payload(
            body.get("occupation_codes"),
            record.get("trade", ""),
            body.get("anzsco_code") or record.get("anzsco_code"),
            body.get("anzsco_title") or record.get("anzsco_title"),
        )
        if not codes:
            raise HTTPException(status_code=400, detail="At least one occupation code is required")
        record["occupation_codes"] = codes
        record["anzsco_code"] = codes.get("ANZSCO", {}).get("code", "")
        record["anzsco_title"] = codes.get("ANZSCO", {}).get("title", record["trade"])
    if "responsibilities" in body:
        responsibilities = [r.strip() for r in body["responsibilities"] if r and r.strip()]
        if not responsibilities:
            raise HTTPException(status_code=400, detail="At least one responsibility is required")
        record["responsibilities"] = responsibilities
    if "duties_generic" in body or "duties" in body:
        generic_duties = [
            d.strip()
            for d in body.get("duties_generic")
            or body.get("duties")
            or record.get("duties_generic")
            or record.get("duties")
            or []
            if d and d.strip()
        ]
        if not generic_duties:
            raise HTTPException(status_code=400, detail="At least one duty is required")
        record["duties_generic"] = generic_duties
        record["duties_by_country"] = {}
        record["duties"] = generic_duties
    if "industry_icon" in body and body["industry_icon"]:
        record["industry_icon"] = body["industry_icon"]
    if "industry_color" in body and body["industry_color"]:
        record["industry_color"] = body["industry_color"]

    trades[idx] = record
    custom["trades"] = trades
    _save_custom(custom)
    return record


def delete_custom_trade(trade_id: str) -> None:
    custom = _load_custom()
    trades = custom.get("trades", [])
    new_trades = [t for t in trades if t["id"] != trade_id]
    if len(new_trades) == len(trades):
        raise HTTPException(status_code=404, detail="Custom trade not found")
    custom["trades"] = new_trades
    _save_custom(custom)

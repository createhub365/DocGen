from fastapi import APIRouter, Depends, Query

import models
from auth import get_current_user
from services import trade_bank
from services.occupation_codes import get_occupation_code_for_country_name, normalize_trade_entry
from services.trade_bank_admin import get_merged_trade_bank

router = APIRouter(tags=["trade-bank"])


@router.get("/trade-bank/industries")
def list_trade_bank_industries(
    _: models.User = Depends(get_current_user),
):
    """All trade-bank industries for wizard industry selection."""
    bank = get_merged_trade_bank()
    items = []
    for ind in bank.get("industries", []):
        trade_count = sum(len(cat.get("trades", [])) for cat in ind.get("categories", []))
        items.append(
            {
                "name": ind["industry"],
                "icon": ind.get("icon") or "📂",
                "color": ind.get("color"),
                "trade_count": trade_count,
                "categories": [c["category"] for c in ind.get("categories", [])],
            }
        )
    return {"industries": items, "total": len(items)}


@router.get("/trade-bank")
def get_trade_bank(
    country: str = Query(...),
    trade: str | None = Query(None),
    category: str | None = Query(None, description="Trade category e.g. Mechanical Services"),
    _: models.User = Depends(get_current_user),
):
    if trade:
        details = trade_bank.get_trade_details(country, trade, category)
        if not details:
            return {"found": False, "trade": None}
        occ = get_occupation_code_for_country_name(details, country)
        return {
            "found": True,
            "trade": details["trade_name"],
            "anzsco_code": details["anzsco_code"],
            "anzsco_title": details.get("anzsco_title", ""),
            "occupation_codes": details.get("occupation_codes", {}),
            "occupation_system": occ["system"],
            "occupation_code": occ["code"],
            "occupation_title": occ["title"],
            "trade_category": details["category"],
            "duties": details["duties"],
            "duty_count": len(details["duties"]),
        }
    return {
        "country": trade_bank.normalize_country(country),
        "trade_categories": trade_bank.list_categories(country),
        "trades": trade_bank.list_trades(country, category),
    }

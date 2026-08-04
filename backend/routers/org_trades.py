"""Org-scoped Trade Bank (prefix /api/platform)."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, get_current_org_user, require_org_role
from database import get_db
from routers.platform_scope import get_org_trade, log_audit_event
from schemas_platform import (
    OrgTradeCreate,
    OrgTradeRead,
    OrgTradeSeedResult,
    OrgTradeUpdate,
)

router = APIRouter(tags=["platform-trades"])


def _duties_list_to_text(entry: dict) -> str:
    """Flatten legacy list[str] duties into a single editable textarea string."""
    for key in ("duties_generic", "duties", "responsibilities"):
        raw = entry.get(key)
        if isinstance(raw, list) and raw:
            lines = [str(item).strip() for item in raw if str(item).strip()]
            if lines:
                return "\n".join(lines)
    return ""


def _iter_legacy_trade_entries() -> list[tuple[str, str]]:
    """
    One-time seed source: copy name + duties from the JSON trade bank via
    get_merged_trade_bank(). No FK or live runtime dependency on legacy tables.
    """
    from services.trade_bank_admin import get_merged_trade_bank

    bank = get_merged_trade_bank()
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for industry in bank.get("industries", []) or []:
        for cat in industry.get("categories", []) or []:
            for entry in cat.get("trades", []) or []:
                name = (
                    entry.get("trade_name")
                    or entry.get("trade")
                    or ""
                ).strip()
                if not name:
                    continue
                key = name.lower()
                if key in seen:
                    continue
                seen.add(key)
                out.append((name, _duties_list_to_text(entry)))
    return out


@router.get("/trades", response_model=List[OrgTradeRead])
def list_org_trades(
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.OrgTrade)
        .filter(models.OrgTrade.org_id == current.org_id)
        .order_by(models.OrgTrade.name.asc())
        .all()
    )
    return rows


@router.post(
    "/trades",
    response_model=OrgTradeRead,
    status_code=status.HTTP_201_CREATED,
)
def create_org_trade(
    body: OrgTradeCreate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    row = models.OrgTrade(
        org_id=current.org_id,
        name=name,
        duties_text=body.duties_text if body.duties_text is not None else "",
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A trade with this name already exists in this organization",
        )
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "org_trade.created",
        "OrgTrade",
        row.id,
        metadata={"name": row.name},
    )
    return row


@router.post(
    "/trades/seed-from-legacy",
    response_model=OrgTradeSeedResult,
)
def seed_org_trades_from_legacy(
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    """
    Copy legacy JSON trade-bank entries into org_trades for this org.
    Idempotent: skips names that already exist. No live FK to legacy storage.
    """
    legacy = _iter_legacy_trade_entries()
    existing = {
        (row.name or "").strip().lower()
        for row in db.query(models.OrgTrade.name)
        .filter(models.OrgTrade.org_id == current.org_id)
        .all()
    }
    created = 0
    skipped = 0
    for name, duties_text in legacy:
        if name.lower() in existing:
            skipped += 1
            continue
        db.add(
            models.OrgTrade(
                org_id=current.org_id,
                name=name,
                duties_text=duties_text or "",
            )
        )
        existing.add(name.lower())
        created += 1
    if created:
        db.commit()
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "org_trades.seeded_from_legacy",
        "Organization",
        None,
        metadata={
            "created": created,
            "skipped": skipped,
            "total_legacy": len(legacy),
        },
    )
    return OrgTradeSeedResult(
        created=created,
        skipped=skipped,
        total_legacy=len(legacy),
    )


@router.get("/trades/{trade_id}", response_model=OrgTradeRead)
def get_org_trade_detail(
    trade_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    return get_org_trade(db, trade_id, current.org_id)


@router.patch("/trades/{trade_id}", response_model=OrgTradeRead)
def update_org_trade(
    trade_id: int,
    body: OrgTradeUpdate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    row = get_org_trade(db, trade_id, current.org_id)
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="name is required")
        row.name = name
    if body.duties_text is not None:
        row.duties_text = body.duties_text
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A trade with this name already exists in this organization",
        )
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "org_trade.updated",
        "OrgTrade",
        row.id,
        metadata={"name": row.name},
    )
    return row


@router.delete("/trades/{trade_id}", status_code=status.HTTP_200_OK)
def delete_org_trade(
    trade_id: int,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    row = get_org_trade(db, trade_id, current.org_id)
    name = row.name
    db.delete(row)
    db.commit()
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "org_trade.deleted",
        "OrgTrade",
        trade_id,
        metadata={"name": name},
    )
    return {"deleted": True, "id": trade_id}

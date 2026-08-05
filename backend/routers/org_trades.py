"""Org-scoped Trade Bank (prefix /api/platform)."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, get_current_org_user, require_org_role
from database import get_db
from routers.platform_scope import (
    get_org_trade,
    get_org_trade_industry,
    log_audit_event,
)
from schemas_platform import (
    OrgTradeCreate,
    OrgTradeGenerateSynonymsRequest,
    OrgTradeGenerateSynonymsResult,
    OrgTradeIndustryCreate,
    OrgTradeIndustryRead,
    OrgTradeIndustryUpdate,
    OrgTradeRead,
    OrgTradeSeedResult,
    OrgTradeSynonymFail,
    OrgTradeUpdate,
)
from services.trade_synonym_generator import (
    GroqNotConfiguredError,
    generate_synonyms_for_trades,
    trade_has_synonyms,
)

router = APIRouter(tags=["platform-trades"])


def _normalize_synonyms(raw) -> list[str]:
    """Normalize to a de-duplicated list of non-empty synonym strings."""
    if raw is None:
        return []
    if isinstance(raw, str):
        items = [p.strip() for p in raw.split(",")]
    elif isinstance(raw, list):
        items = [str(p).strip() for p in raw]
    else:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if not item:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _duties_list_to_text(entry: dict) -> str:
    """Flatten legacy list[str] duties into a single editable textarea string."""
    for key in ("duties_generic", "duties", "responsibilities"):
        raw = entry.get(key)
        if isinstance(raw, list) and raw:
            lines = [str(item).strip() for item in raw if str(item).strip()]
            if lines:
                return "\n".join(lines)
    return ""


def _iter_legacy_trade_entries() -> list[tuple[str, str, str]]:
    """
    Yield (industry_name, trade_name, duties_text) from the JSON trade bank.

    Categories are intentionally not modeled as a third level — see seed docs.
    No synonym/alias fields exist in complete_trade_bank.json.
    """
    from services.trade_bank_admin import get_merged_trade_bank

    bank = get_merged_trade_bank()
    out: list[tuple[str, str, str]] = []
    seen: set[str] = set()
    for industry in bank.get("industries", []) or []:
        industry_name = (industry.get("industry") or "").strip()
        if not industry_name:
            continue
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
                out.append((industry_name, name, _duties_list_to_text(entry)))
    return out


def _industry_name_map(db: Session, org_id: str) -> dict[int, str]:
    rows = (
        db.query(models.OrgTradeIndustry)
        .filter(models.OrgTradeIndustry.org_id == org_id)
        .all()
    )
    return {row.id: row.name for row in rows}


def _trade_to_read(
    row: models.OrgTrade, industry_names: dict[int, str] | None = None
) -> OrgTradeRead:
    industry_name = None
    if row.industry_id is not None:
        if industry_names is not None:
            industry_name = industry_names.get(row.industry_id)
        elif row.industry is not None:
            industry_name = row.industry.name
    return OrgTradeRead(
        id=row.id,
        org_id=row.org_id,
        name=row.name,
        duties_text=row.duties_text or "",
        industry_id=row.industry_id,
        industry_name=industry_name,
        synonyms=_normalize_synonyms(row.synonyms),
        created_at=row.created_at,
    )


def _resolve_industry_id(
    db: Session, org_id: str, industry_id: Optional[int]
) -> Optional[int]:
    if industry_id is None:
        return None
    get_org_trade_industry(db, industry_id, org_id)
    return industry_id


# ---- Industries ----


@router.get("/trade-industries", response_model=List[OrgTradeIndustryRead])
def list_org_trade_industries(
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.OrgTradeIndustry)
        .filter(models.OrgTradeIndustry.org_id == current.org_id)
        .order_by(models.OrgTradeIndustry.name.asc())
        .all()
    )


@router.post(
    "/trade-industries",
    response_model=OrgTradeIndustryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_org_trade_industry(
    body: OrgTradeIndustryCreate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    row = models.OrgTradeIndustry(org_id=current.org_id, name=name)
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An industry with this name already exists in this organization",
        )
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "org_trade_industry.created",
        "OrgTradeIndustry",
        row.id,
        metadata={"name": row.name},
    )
    return row


@router.patch(
    "/trade-industries/{industry_id}",
    response_model=OrgTradeIndustryRead,
)
def update_org_trade_industry(
    industry_id: int,
    body: OrgTradeIndustryUpdate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    row = get_org_trade_industry(db, industry_id, current.org_id)
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="name is required")
        row.name = name
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An industry with this name already exists in this organization",
        )
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "org_trade_industry.updated",
        "OrgTradeIndustry",
        row.id,
        metadata={"name": row.name},
    )
    return row


@router.delete("/trade-industries/{industry_id}", status_code=status.HTTP_200_OK)
def delete_org_trade_industry(
    industry_id: int,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    row = get_org_trade_industry(db, industry_id, current.org_id)
    name = row.name
    # SET NULL via FK ondelete + explicit clear for SQLite / safety.
    (
        db.query(models.OrgTrade)
        .filter(
            models.OrgTrade.org_id == current.org_id,
            models.OrgTrade.industry_id == row.id,
        )
        .update({models.OrgTrade.industry_id: None}, synchronize_session=False)
    )
    db.delete(row)
    db.commit()
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "org_trade_industry.deleted",
        "OrgTradeIndustry",
        industry_id,
        metadata={"name": name},
    )
    return {"deleted": True, "id": industry_id}


# ---- Trades ----


@router.get("/trades", response_model=List[OrgTradeRead])
def list_org_trades(
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    names = _industry_name_map(db, current.org_id)
    rows = (
        db.query(models.OrgTrade)
        .filter(models.OrgTrade.org_id == current.org_id)
        .order_by(models.OrgTrade.name.asc())
        .all()
    )
    return [_trade_to_read(row, names) for row in rows]


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
    industry_id = _resolve_industry_id(db, current.org_id, body.industry_id)
    row = models.OrgTrade(
        org_id=current.org_id,
        name=name,
        duties_text=body.duties_text if body.duties_text is not None else "",
        industry_id=industry_id,
        synonyms=_normalize_synonyms(body.synonyms),
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
    return _trade_to_read(row, _industry_name_map(db, current.org_id))


@router.post(
    "/trades/seed-from-legacy",
    response_model=OrgTradeSeedResult,
)
def seed_org_trades_from_legacy(
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    """
    Copy legacy JSON trade-bank entries into org industries + trades.

    Idempotent: skips existing industry/trade names. Existing trades with a
    null industry_id are linked to the matching industry on re-run.
    Categories are not a third model level — trade names stay as in legacy.
    """
    legacy = _iter_legacy_trade_entries()

    existing_industries = {
        (row.name or "").strip().lower(): row
        for row in db.query(models.OrgTradeIndustry)
        .filter(models.OrgTradeIndustry.org_id == current.org_id)
        .all()
    }
    existing_trades = {
        (row.name or "").strip().lower(): row
        for row in db.query(models.OrgTrade)
        .filter(models.OrgTrade.org_id == current.org_id)
        .all()
    }

    industries_created = 0
    industries_skipped = 0
    created = 0
    skipped = 0
    dirty = False

    # Ensure all industries exist first
    industry_names_ordered: list[str] = []
    seen_ind: set[str] = set()
    for industry_name, _name, _duties in legacy:
        key = industry_name.lower()
        if key in seen_ind:
            continue
        seen_ind.add(key)
        industry_names_ordered.append(industry_name)

    for industry_name in industry_names_ordered:
        key = industry_name.lower()
        if key in existing_industries:
            industries_skipped += 1
            continue
        row = models.OrgTradeIndustry(org_id=current.org_id, name=industry_name)
        db.add(row)
        db.flush()
        existing_industries[key] = row
        industries_created += 1
        dirty = True

    for industry_name, name, duties_text in legacy:
        industry_row = existing_industries[industry_name.lower()]
        trade_key = name.lower()
        if trade_key in existing_trades:
            skipped += 1
            existing = existing_trades[trade_key]
            # Backfill industry link for trades seeded before industries existed
            if existing.industry_id is None:
                existing.industry_id = industry_row.id
                dirty = True
            continue
        db.add(
            models.OrgTrade(
                org_id=current.org_id,
                name=name,
                duties_text=duties_text or "",
                industry_id=industry_row.id,
                synonyms=[],
            )
        )
        existing_trades[trade_key] = True  # type: ignore[assignment]
        created += 1
        dirty = True

    if dirty:
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
            "industries_created": industries_created,
            "industries_skipped": industries_skipped,
        },
    )
    return OrgTradeSeedResult(
        created=created,
        skipped=skipped,
        total_legacy=len(legacy),
        industries_created=industries_created,
        industries_skipped=industries_skipped,
    )


@router.post(
    "/trades/generate-synonyms",
    response_model=OrgTradeGenerateSynonymsResult,
)
def generate_org_trade_synonyms(
    body: OrgTradeGenerateSynonymsRequest | None = None,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    """
    Bulk-fill empty synonyms via Groq for this org's trades.

    Idempotent: skips trades that already have synonyms. Optional
    max_trades chunks the work for free-tier / timeout safety.
    """
    body = body or OrgTradeGenerateSynonymsRequest()
    if body.max_trades is not None and body.max_trades < 1:
        raise HTTPException(status_code=422, detail="max_trades must be >= 1")

    rows = (
        db.query(models.OrgTrade)
        .filter(models.OrgTrade.org_id == current.org_id)
        .order_by(models.OrgTrade.name.asc())
        .all()
    )
    total_checked = len(rows)
    already = [r for r in rows if trade_has_synonyms(r)]
    needs = [r for r in rows if not trade_has_synonyms(r)]
    deferred = 0
    if body.max_trades is not None and len(needs) > body.max_trades:
        deferred = len(needs) - body.max_trades
        needs = needs[: body.max_trades]

    if not needs:
        log_audit_event(
            db,
            current.org_id,
            current.user_id,
            "org_trades.generate_synonyms",
            "Organization",
            None,
            metadata={
                "total_checked": total_checked,
                "updated": 0,
                "skipped_already_had": len(already),
                "failed": 0,
                "max_trades": body.max_trades,
                "remaining_without_synonyms": deferred,
            },
        )
        return OrgTradeGenerateSynonymsResult(
            total_checked=total_checked,
            updated=0,
            skipped_already_had=len(already),
            failed=[],
            remaining_without_synonyms=deferred,
        )

    try:
        updates, failed_raw = generate_synonyms_for_trades(needs)
    except GroqNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    updated = 0
    by_id = {r.id: r for r in needs}
    for trade_id, syns in updates.items():
        row = by_id.get(trade_id)
        if not row or not syns:
            continue
        row.synonyms = syns
        updated += 1

    if updated:
        db.commit()

    failed = [
        OrgTradeSynonymFail(
            trade_id=int(item["trade_id"]),
            name=str(item.get("name") or ""),
            reason=str(item.get("reason") or "failed"),
        )
        for item in failed_raw
    ]

    # Still-empty after this chunk (deferred + failed/unupdated in chunk)
    still_empty = (
        db.query(models.OrgTrade)
        .filter(models.OrgTrade.org_id == current.org_id)
        .all()
    )
    remaining = sum(1 for r in still_empty if not trade_has_synonyms(r))

    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "org_trades.generate_synonyms",
        "Organization",
        None,
        metadata={
            "total_checked": total_checked,
            "updated": updated,
            "skipped_already_had": len(already),
            "failed": len(failed),
            "max_trades": body.max_trades,
            "remaining_without_synonyms": remaining,
        },
    )
    return OrgTradeGenerateSynonymsResult(
        total_checked=total_checked,
        updated=updated,
        skipped_already_had=len(already),
        failed=failed,
        remaining_without_synonyms=remaining,
    )


@router.get("/trades/{trade_id}", response_model=OrgTradeRead)
def get_org_trade_detail(
    trade_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    row = get_org_trade(db, trade_id, current.org_id)
    return _trade_to_read(row, _industry_name_map(db, current.org_id))


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
    if "industry_id" in body.model_fields_set:
        row.industry_id = _resolve_industry_id(db, current.org_id, body.industry_id)
    if body.synonyms is not None:
        row.synonyms = _normalize_synonyms(body.synonyms)
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
    return _trade_to_read(row, _industry_name_map(db, current.org_id))


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

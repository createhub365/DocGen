"""Trade-linked position + duties_block pairing helpers."""

from __future__ import annotations

from typing import Any, Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

import models

DUTIES_BLOCK_KEY = "duties_block"
TRADE_LINKED_POSITION_KIND = "trade_linked_position"
TRADE_LINKED_DUTIES_KIND = "trade_linked_duties"  # legacy
TRADE_LINKED_DUTIES_COMPANION_KIND = "trade_linked_duties_companion"

DUTIES_REQUIRES_POSITION_MSG = (
    "duties_block requires a Trade-linked position field in this flow — "
    "add one in Flow Builder first"
)


def _cfg_kind(cfg: Any) -> Optional[str]:
    if isinstance(cfg, dict):
        kind = cfg.get("kind")
        return str(kind) if kind else None
    return None


def is_trade_linked_position_field(field: models.FieldDefinition) -> bool:
    return _cfg_kind(field.auto_config_json) == TRADE_LINKED_POSITION_KIND


def is_legacy_trade_linked_duties_field(field: models.FieldDefinition) -> bool:
    return _cfg_kind(field.auto_config_json) == TRADE_LINKED_DUTIES_KIND


def duties_field_key_for_position(field: models.FieldDefinition) -> str:
    cfg = field.auto_config_json if isinstance(field.auto_config_json, dict) else {}
    key = str(cfg.get("duties_field_key") or DUTIES_BLOCK_KEY).strip()
    return key or DUTIES_BLOCK_KEY


def list_flow_fields(db: Session, flow_config_id: int) -> list[models.FieldDefinition]:
    return (
        db.query(models.FieldDefinition)
        .join(models.FlowStep, models.FieldDefinition.flow_step_id == models.FlowStep.id)
        .filter(models.FlowStep.flow_config_id == flow_config_id)
        .all()
    )


def find_trade_linked_position_fields(
    fields: Iterable[models.FieldDefinition],
) -> list[models.FieldDefinition]:
    return [f for f in fields if is_trade_linked_position_field(f)]


def normalize_trade_linked_position_config(cfg: Any) -> dict:
    """Canonical auto_config for a Trade-linked position field."""
    duties_key = DUTIES_BLOCK_KEY
    if isinstance(cfg, dict):
        raw = str(cfg.get("duties_field_key") or DUTIES_BLOCK_KEY).strip()
        if raw:
            duties_key = raw
    return {
        "kind": TRADE_LINKED_POSITION_KIND,
        "duties_field_key": duties_key,
    }


def normalize_duties_companion_config(source_field_key: str) -> dict:
    return {
        "kind": TRADE_LINKED_DUTIES_COMPANION_KIND,
        "source_field_key": (source_field_key or "").strip(),
    }


def assert_duties_block_mapping_allowed(db: Session, flow_config_id: int) -> None:
    """Reject mapping {{duties_block}} unless a Trade-linked position field exists."""
    fields = list_flow_fields(db, flow_config_id)
    if not find_trade_linked_position_fields(fields):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=DUTIES_REQUIRES_POSITION_MSG,
        )


def assert_flow_trade_position_pairing(db: Session, flow_config_id: int) -> None:
    """
    Publish-time pairing checks:
    - duties_block field requires a Trade-linked position field
    - each Trade-linked position's duties_field_key must exist on the flow
    """
    fields = list_flow_fields(db, flow_config_id)
    by_key = {(f.field_key or "").strip().lower(): f for f in fields}
    position_fields = find_trade_linked_position_fields(fields)
    has_duties = DUTIES_BLOCK_KEY in by_key

    if has_duties and not position_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=DUTIES_REQUIRES_POSITION_MSG,
        )

    for pos in position_fields:
        duties_key = duties_field_key_for_position(pos).lower()
        if duties_key not in by_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=DUTIES_REQUIRES_POSITION_MSG,
            )

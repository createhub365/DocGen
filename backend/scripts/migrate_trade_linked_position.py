"""
Wire plain position + duties_block into trade_linked_position (config-only).

Targets published flows:
  30, 31 — Brightway
  81     — BrightWay Study Consultant

For each flow: set position.auto_config_json =
  { "kind": "trade_linked_position", "duties_field_key": "duties_block" }
Does NOT rewrite duties_block text or any other field content.

Usage (from backend/):
  python scripts/migrate_trade_linked_position.py --dry-run --live
  python scripts/migrate_trade_linked_position.py --apply --live

Requires --live (connects to Supabase via DATABASE_PASSWORD + SUPABASE_URL).
Local sqlite is never used for this migration.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote_plus

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

TARGET_FLOW_IDS = (30, 31, 81)
TARGET_CONFIG = {
    "kind": "trade_linked_position",
    "duties_field_key": "duties_block",
}


@dataclass
class FieldPlan:
    field_id: int
    field_key: str
    field_label: str
    before_cfg: Any
    after_cfg: dict
    action: str  # update | skip | error


@dataclass
class FlowPlan:
    flow_id: int
    org_name: str
    doc_type_name: str
    is_published: bool
    position: Optional[FieldPlan]
    duties: Optional[FieldPlan]
    other_position_like: list[str]
    errors: list[str]
    would_change: bool


def _live_engine() -> Engine:
    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env", override=True)
    pw = os.getenv("DATABASE_PASSWORD", "")
    supa = os.getenv("SUPABASE_URL", "")
    m = re.search(r"https?://([^.]+)\.supabase\.co", supa or "")
    if not pw or not m:
        raise SystemExit(
            "FATAL: --live requires DATABASE_PASSWORD and SUPABASE_URL in backend/.env"
        )
    ref = m.group(1)
    url = (
        f"postgresql://postgres.{ref}:{quote_plus(pw)}"
        f"@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require"
    )
    return create_engine(url, pool_pre_ping=True)


def _cfg_equal(a: Any, b: Any) -> bool:
    def norm(x: Any) -> Any:
        if x is None or x == "null":
            return None
        if isinstance(x, str):
            try:
                return json.loads(x)
            except json.JSONDecodeError:
                return x
        return x

    return norm(a) == norm(b)


def build_plans(engine: Engine, flow_ids: tuple[int, ...] = TARGET_FLOW_IDS) -> list[FlowPlan]:
    plans: list[FlowPlan] = []
    with engine.connect() as conn:
        for flow_id in flow_ids:
            meta = conn.execute(
                text(
                    """
                    SELECT fc.id AS flow_id, fc.is_published, fc.version,
                           o.name AS org_name, dt.name AS doc_type_name
                    FROM flow_configs fc
                    JOIN org_document_types dt ON dt.id = fc.document_type_id
                    JOIN organizations o ON o.id = dt.org_id
                    WHERE fc.id = :fid
                    """
                ),
                {"fid": flow_id},
            ).mappings().first()
            if not meta:
                plans.append(
                    FlowPlan(
                        flow_id=flow_id,
                        org_name="?",
                        doc_type_name="?",
                        is_published=False,
                        position=None,
                        duties=None,
                        other_position_like=[],
                        errors=[f"flow_id {flow_id} not found"],
                        would_change=False,
                    )
                )
                continue

            fields = conn.execute(
                text(
                    """
                    SELECT fd.id, fd.field_key, fd.field_label,
                           fd.auto_config_json, fd.is_auto_generated
                    FROM field_definitions fd
                    JOIN flow_steps fs ON fs.id = fd.flow_step_id
                    WHERE fs.flow_config_id = :fid
                    ORDER BY fd.id
                    """
                ),
                {"fid": flow_id},
            ).mappings().all()

            by_key = {str(r["field_key"]).strip().lower(): r for r in fields}
            position_row = by_key.get("position")
            duties_row = by_key.get("duties_block")
            other_pos = [
                r["field_key"]
                for r in fields
                if "position" in str(r["field_key"]).lower()
                and str(r["field_key"]).strip().lower() != "position"
            ]

            errors: list[str] = []
            if not position_row:
                errors.append("missing field_key=position")
            if not duties_row:
                errors.append("missing field_key=duties_block")

            position_plan = None
            if position_row:
                before = position_row["auto_config_json"]
                if _cfg_equal(before, TARGET_CONFIG):
                    position_plan = FieldPlan(
                        field_id=position_row["id"],
                        field_key=position_row["field_key"],
                        field_label=position_row["field_label"],
                        before_cfg=before,
                        after_cfg=TARGET_CONFIG,
                        action="skip",
                    )
                else:
                    position_plan = FieldPlan(
                        field_id=position_row["id"],
                        field_key=position_row["field_key"],
                        field_label=position_row["field_label"],
                        before_cfg=before,
                        after_cfg=TARGET_CONFIG,
                        action="update",
                    )

            duties_plan = None
            if duties_row:
                duties_plan = FieldPlan(
                    field_id=duties_row["id"],
                    field_key=duties_row["field_key"],
                    field_label=duties_row["field_label"],
                    before_cfg=duties_row["auto_config_json"],
                    after_cfg=duties_row["auto_config_json"]
                    if isinstance(duties_row["auto_config_json"], dict)
                    else duties_row["auto_config_json"],
                    action="skip",  # never rewrite duties field
                )

            would_change = bool(position_plan and position_plan.action == "update" and not errors)
            plans.append(
                FlowPlan(
                    flow_id=flow_id,
                    org_name=meta["org_name"],
                    doc_type_name=meta["doc_type_name"],
                    is_published=bool(meta["is_published"]),
                    position=position_plan,
                    duties=duties_plan,
                    other_position_like=other_pos,
                    errors=errors,
                    would_change=would_change,
                )
            )
    return plans


def apply_plans(engine: Engine, plans: list[FlowPlan], *, dry_run: bool) -> int:
    updated = 0
    if dry_run:
        return sum(1 for p in plans if p.would_change)

    with engine.begin() as conn:
        for plan in plans:
            if plan.errors or not plan.position or plan.position.action != "update":
                continue
            conn.execute(
                text(
                    """
                    UPDATE field_definitions
                    SET auto_config_json = CAST(:cfg AS jsonb)
                    WHERE id = :fid
                    """
                ),
                {
                    "fid": plan.position.field_id,
                    "cfg": json.dumps(TARGET_CONFIG),
                },
            )
            updated += 1
    return updated


def verify_pairing(engine: Engine, flow_ids: tuple[int, ...] = TARGET_FLOW_IDS) -> list[str]:
    """Post-apply / dry-run check: each flow has trade_linked_position + duties_block."""
    lines: list[str] = []
    with engine.connect() as conn:
        for flow_id in flow_ids:
            rows = conn.execute(
                text(
                    """
                    SELECT fd.field_key, fd.auto_config_json::text AS cfg
                    FROM field_definitions fd
                    JOIN flow_steps fs ON fs.id = fd.flow_step_id
                    WHERE fs.flow_config_id = :fid
                      AND lower(fd.field_key) IN ('position', 'duties_block')
                    """
                ),
                {"fid": flow_id},
            ).mappings().all()
            by_key = {r["field_key"]: r["cfg"] for r in rows}
            pos_cfg = by_key.get("position")
            has_duties = "duties_block" in by_key
            ok = has_duties and pos_cfg and "trade_linked_position" in (pos_cfg or "")
            lines.append(
                f"  flow {flow_id}: position_cfg={pos_cfg!r} "
                f"has_duties_block={has_duties} pairing_ok={ok}"
            )
    return lines


def count_other_touched(engine: Engine) -> int:
    """How many field_definitions outside target flows already have trade_linked_position."""
    with engine.connect() as conn:
        n = conn.execute(
            text(
                """
                SELECT count(*) AS c FROM field_definitions fd
                JOIN flow_steps fs ON fs.id = fd.flow_step_id
                WHERE fd.auto_config_json::text ILIKE '%trade_linked_position%'
                  AND fs.flow_config_id NOT IN (30, 31, 81)
                """
            ),
        ).scalar()
        return int(n or 0)


def format_report(plans: list[FlowPlan], *, dry_run: bool, updated: int) -> str:
    mode = "DRY-RUN" if dry_run else "APPLY"
    lines = [
        f"=== migrate_trade_linked_position [{mode}] ===",
        f"target_flow_ids={list(TARGET_FLOW_IDS)}",
        f"target_config={json.dumps(TARGET_CONFIG)}",
        "",
    ]
    for p in plans:
        lines.append(
            f"--- flow_id={p.flow_id} org={p.org_name!r} "
            f"doc_type={p.doc_type_name!r} published={p.is_published} ---"
        )
        if p.errors:
            lines.append(f"  ERRORS: {p.errors}")
        if p.position:
            lines.append(
                f"  position id={p.position.field_id} "
                f"label={p.position.field_label!r} action={p.position.action}"
            )
            lines.append(f"    before: {json.dumps(p.position.before_cfg)}")
            lines.append(f"    after:  {json.dumps(p.position.after_cfg)}")
        else:
            lines.append("  position: MISSING")
        if p.duties:
            lines.append(
                f"  duties_block id={p.duties.field_id} "
                f"label={p.duties.field_label!r} action=UNTOUCHED "
                f"cfg={json.dumps(p.duties.before_cfg)}"
            )
        else:
            lines.append("  duties_block: MISSING")
        if p.other_position_like:
            lines.append(f"  note other keys: {p.other_position_like}")
        lines.append(f"  would_change={p.would_change}")
        lines.append("")

    changeable = sum(1 for p in plans if p.would_change)
    blocked = sum(1 for p in plans if p.errors)
    lines.append(f"summary: changeable={changeable} skipped_or_ok={len(plans)-changeable-blocked} errors={blocked}")
    if not dry_run:
        lines.append(f"rows_updated={updated}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Config-only migration: position → trade_linked_position on flows 30/31/81"
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Plan only; no writes")
    mode.add_argument("--apply", action="store_true", help="Write auto_config_json updates")
    parser.add_argument(
        "--live",
        action="store_true",
        required=True,
        help="Required. Connect to live Supabase (never local sqlite).",
    )
    args = parser.parse_args(argv)
    dry_run = bool(args.dry_run)

    engine = _live_engine()
    plans = build_plans(engine)
    updated = apply_plans(engine, plans, dry_run=dry_run)
    print(format_report(plans, dry_run=dry_run, updated=updated))
    print("\n=== pairing check ===")
    # After dry-run, show projected pairing; after apply, show actual
    if dry_run:
        for p in plans:
            projected_ok = (
                not p.errors
                and p.duties is not None
                and p.position is not None
                and (p.position.action in ("update", "skip"))
            )
            print(
                f"  flow {p.flow_id}: projected_pairing_ok={projected_ok} "
                f"would_change={p.would_change}"
            )
    else:
        for line in verify_pairing(engine):
            print(line)

    outside = count_other_touched(engine)
    print(f"\nother_flows_with_trade_linked_position={outside}")
    return 0 if not any(p.errors for p in plans) else 1


if __name__ == "__main__":
    raise SystemExit(main())

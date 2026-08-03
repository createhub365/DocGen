"""Phase C — mapping orphan audit vs target published flow (read-only)."""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_env = ROOT / ".env"
if _env.is_file():
    for line in _env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val

from sqlalchemy.orm import Session  # noqa: E402

import models  # noqa: E402
from database import SessionLocal  # noqa: E402
from routers.platform_scope import resolvable_field_keys_for_published_flow  # noqa: E402
from scripts.clone_flows_to_templates import build_plans  # noqa: E402


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _suggest_remap(orphan: str, allowed: set[str]) -> str | None:
    """Conservative suggestions used in prior Phase A remaps."""
    o = orphan.lower().strip()
    n = _norm(orphan)
    # Exact case-insensitive
    for a in allowed:
        if a.lower() == o:
            return a
    # Known historical aliases
    aliases = {
        "candidate_salutation": "salutation",
        "solutation": "salutation",
        "passport_expiry": "passport_expiry_date",
        "appplication_recieved_date": "application_received_date",
        "application_no": "application_number",
    }
    if o in aliases and aliases[o] in allowed:
        return aliases[o]
    # Strip leading candidate_
    if o.startswith("candidate_") and o[len("candidate_") :] in allowed:
        return o[len("candidate_") :]
    # Normalized equality
    for a in allowed:
        if _norm(a) == n:
            return a
    # Single high-overlap substring (len>=6) unique match
    cands = []
    for a in allowed:
        an = _norm(a)
        if len(n) >= 6 and (n in an or an in n):
            cands.append(a)
    if len(cands) == 1:
        return cands[0]
    return None


def _active_templates_without_owned_or_shared(db: Session):
    """Active org templates that have no owned flow AND no published shared DT flow."""
    rows = (
        db.query(models.Template, models.OrgDocumentType)
        .outerjoin(
            models.OrgDocumentType,
            models.Template.org_document_type_id == models.OrgDocumentType.id,
        )
        .filter(
            models.Template.is_active.is_(True),
            models.Template.org_id.isnot(None),
            models.Template.org_document_type_id.isnot(None),
        )
        .order_by(models.Template.id.asc())
        .all()
    )
    out = []
    for tmpl, odt in rows:
        owned = (
            db.query(models.FlowConfig.id)
            .filter(models.FlowConfig.template_id == tmpl.id)
            .first()
        )
        if owned:
            continue
        shared = None
        if odt:
            shared = (
                db.query(models.FlowConfig.id)
                .filter(
                    models.FlowConfig.document_type_id == odt.id,
                    models.FlowConfig.is_published.is_(True),
                    models.FlowConfig.template_id.is_(None),
                )
                .first()
            )
        if not shared:
            out.append((tmpl, odt))
    return out


def audit(db: Session) -> dict:
    plans = build_plans(db)
    orphan_report = []
    clone_targets = []
    skip_existing = []

    for plan in plans:
        allowed = set(plan.source_field_keys)
        for t in plan.templates:
            if t.action == "clone":
                clone_targets.append(
                    {
                        "template_id": t.template_id,
                        "name": t.display_name,
                        "dt_id": plan.document_type_id,
                        "dt_name": plan.document_type_name,
                        "org_id": plan.org_id,
                        "source_flow_id": plan.source_flow_id,
                        "source_version": plan.source_version,
                        "field_count": t.field_count,
                    }
                )
                target_flow_id = plan.source_flow_id
                target_keys = allowed
                target_kind = "shared_source_to_clone"
            else:
                skip_existing.append(
                    {
                        "template_id": t.template_id,
                        "name": t.display_name,
                        "dt_id": plan.document_type_id,
                        "dt_name": plan.document_type_name,
                    }
                )
                owned = (
                    db.query(models.FlowConfig)
                    .filter(
                        models.FlowConfig.template_id == t.template_id,
                        models.FlowConfig.is_published.is_(True),
                    )
                    .first()
                )
                if not owned:
                    continue
                target_flow_id = owned.id
                target_keys = resolvable_field_keys_for_published_flow(db, owned)
                target_kind = "owned_published"

            mappings = (
                db.query(models.PlaceholderMapping)
                .filter(
                    models.PlaceholderMapping.template_id == t.template_id,
                    models.PlaceholderMapping.is_mapped.is_(True),
                )
                .all()
            )
            remaps = []
            clears = []
            ok = []
            for m in mappings:
                fk = (m.field_key or "").strip()
                if not fk:
                    continue
                if fk in target_keys:
                    ok.append(
                        {
                            "placeholder": m.placeholder_key,
                            "field_key": fk,
                        }
                    )
                    continue
                suggestion = _suggest_remap(fk, target_keys)
                if suggestion:
                    remaps.append(
                        {
                            "placeholder": m.placeholder_key,
                            "from": fk,
                            "to": suggestion,
                        }
                    )
                else:
                    clears.append(
                        {
                            "placeholder": m.placeholder_key,
                            "field_key": fk,
                            "action": "CLEAR (is_mapped=false)",
                        }
                    )
            if remaps or clears:
                orphan_report.append(
                    {
                        "template_id": t.template_id,
                        "name": t.display_name,
                        "dt_id": plan.document_type_id,
                        "dt_name": plan.document_type_name,
                        "org_id": plan.org_id,
                        "target_kind": target_kind,
                        "target_flow_id": target_flow_id,
                        "mapped_ok": len(ok),
                        "remaps": remaps,
                        "clears": clears,
                    }
                )

    manual = []
    for tmpl, odt in _active_templates_without_owned_or_shared(db):
        manual.append(
            {
                "template_id": tmpl.id,
                "name": tmpl.display_name or tmpl.docx_filename,
                "dt_id": odt.id if odt else None,
                "dt_name": odt.name if odt else None,
                "org_id": tmpl.org_id,
                "reason": "no_published_shared_flow_and_no_owned_flow",
            }
        )

    # Totals
    active_with_org = (
        db.query(models.Template)
        .filter(
            models.Template.is_active.is_(True),
            models.Template.org_id.isnot(None),
            models.Template.org_document_type_id.isnot(None),
        )
        .count()
    )
    with_owned = (
        db.query(models.Template.id)
        .filter(
            models.Template.is_active.is_(True),
            models.Template.org_id.isnot(None),
        )
        .join(
            models.FlowConfig,
            models.FlowConfig.template_id == models.Template.id,
        )
        .distinct()
        .count()
    )

    return {
        "summary": {
            "active_org_templates": active_with_org,
            "already_have_owned_flow": with_owned,
            "clone_candidates": len(clone_targets),
            "skip_existing": len(skip_existing),
            "templates_with_orphans": len(orphan_report),
            "manual_setup_no_source_flow": len(manual),
            "total_remaps": sum(len(r["remaps"]) for r in orphan_report),
            "total_clears": sum(len(r["clears"]) for r in orphan_report),
        },
        "clone_targets": clone_targets,
        "skip_existing": skip_existing,
        "orphan_report": orphan_report,
        "manual_setup": manual,
    }


def main() -> int:
    db = SessionLocal()
    try:
        report = audit(db)
        out = Path(r"C:\Users\neeru\DocGenPro_Backups\phase_c_orphan_audit.json")
        out.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report["summary"], indent=2))
        print(f"\nWrote {out}")
        print("\n=== MANUAL SETUP (no shared published flow) ===")
        for m in report["manual_setup"]:
            print(
                f"  tpl {m['template_id']} [{m['name']}] "
                f"DT {m['dt_id']} [{m['dt_name']}] org={m['org_id']}"
            )
        print("\n=== ORPHANS / PROPOSED REMAP+CLEAR ===")
        if not report["orphan_report"]:
            print("  (none)")
        for row in report["orphan_report"]:
            print(
                f"\nTemplate {row['template_id']} [{row['name']}] "
                f"DT {row['dt_id']} {row['dt_name']} "
                f"via {row['target_kind']} flow={row['target_flow_id']} "
                f"(ok={row['mapped_ok']})"
            )
            for r in row["remaps"]:
                print(
                    f"  REMAP  {r['placeholder']}: {r['from']} -> {r['to']}"
                )
            for c in row["clears"]:
                print(
                    f"  CLEAR  {c['placeholder']}: {c['field_key']}"
                )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

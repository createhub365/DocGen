"""
Phase A — clone published document-type flows onto each template.

Idempotent, reviewable, not run by Alembic. Leaves original document-type
FlowConfig rows untouched.

For each org_document_type that has a PUBLISHED FlowConfig:
  For each active template under that document type that does NOT already
  have any FlowConfig with template_id set:
    Create a NEW published FlowConfig (template_id set, document_type_id NULL,
    version=1) with an exact copy of FlowSteps + FieldDefinitions (new ids,
    same field_key / order / content).

field_key strings are preserved so PlaceholderMapping rows (which store
field_key, not FieldDefinition ids) continue to resolve against the new
per-template flow without rewrite.

Usage (from backend/):
  python scripts/clone_flows_to_templates.py --dry-run
  python scripts/clone_flows_to_templates.py --apply
  python scripts/clone_flows_to_templates.py --dry-run --document-type-id 5
  python scripts/clone_flows_to_templates.py --dry-run --name-contains "Offer Letter"
"""
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Load .env if present (local / staging) before importing database.
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
from routers.platform_scope import (  # noqa: E402
    copy_flow_steps_and_fields,
    resolvable_field_keys_for_published_flow,
)


@dataclass
class TemplateClonePlan:
    template_id: int
    display_name: str | None
    action: str  # clone | skip_existing
    field_count: int = 0
    step_count: int = 0
    new_flow_id: int | None = None


@dataclass
class DocTypeClonePlan:
    document_type_id: int
    document_type_name: str
    org_id: str
    source_flow_id: int
    source_version: int
    source_field_keys: list[str] = field(default_factory=list)
    templates: list[TemplateClonePlan] = field(default_factory=list)


def _active_templates_for_dt(db: Session, document_type_id: int) -> list[models.Template]:
    return (
        db.query(models.Template)
        .filter(
            models.Template.org_document_type_id == document_type_id,
            models.Template.is_active.is_(True),
        )
        .order_by(models.Template.id.asc())
        .all()
    )


def _template_already_has_flow(db: Session, template_id: int) -> bool:
    return (
        db.query(models.FlowConfig.id)
        .filter(models.FlowConfig.template_id == template_id)
        .first()
        is not None
    )


def _field_count_for_flow(db: Session, flow_id: int) -> tuple[int, int]:
    steps = (
        db.query(models.FlowStep)
        .filter(models.FlowStep.flow_config_id == flow_id)
        .all()
    )
    step_ids = [s.id for s in steps]
    if not step_ids:
        return 0, 0
    fields = (
        db.query(models.FieldDefinition)
        .filter(models.FieldDefinition.flow_step_id.in_(step_ids))
        .count()
    )
    return len(steps), int(fields)


def build_plans(
    db: Session,
    *,
    document_type_id: int | None = None,
    name_contains: str | None = None,
) -> list[DocTypeClonePlan]:
    q = (
        db.query(models.FlowConfig, models.OrgDocumentType)
        .join(
            models.OrgDocumentType,
            models.FlowConfig.document_type_id == models.OrgDocumentType.id,
        )
        .filter(
            models.FlowConfig.is_published.is_(True),
            models.FlowConfig.document_type_id.isnot(None),
            models.FlowConfig.template_id.is_(None),
            # Include inactive document types: admins may have soft-disabled the
            # type while templates + published flow still need per-template clones.
        )
        .order_by(models.OrgDocumentType.id.asc())
    )
    if document_type_id is not None:
        q = q.filter(models.OrgDocumentType.id == document_type_id)
    if name_contains:
        q = q.filter(models.OrgDocumentType.name.ilike(f"%{name_contains}%"))

    plans: list[DocTypeClonePlan] = []
    for flow, odt in q.all():
        keys = sorted(resolvable_field_keys_for_published_flow(db, flow))
        step_count, field_count = _field_count_for_flow(db, flow.id)
        plan = DocTypeClonePlan(
            document_type_id=odt.id,
            document_type_name=odt.name,
            org_id=odt.org_id,
            source_flow_id=flow.id,
            source_version=flow.version,
            source_field_keys=keys,
        )
        for tmpl in _active_templates_for_dt(db, odt.id):
            if _template_already_has_flow(db, tmpl.id):
                plan.templates.append(
                    TemplateClonePlan(
                        template_id=tmpl.id,
                        display_name=tmpl.display_name or tmpl.docx_filename,
                        action="skip_existing",
                        field_count=0,
                        step_count=0,
                    )
                )
            else:
                plan.templates.append(
                    TemplateClonePlan(
                        template_id=tmpl.id,
                        display_name=tmpl.display_name or tmpl.docx_filename,
                        action="clone",
                        field_count=field_count,
                        step_count=step_count,
                    )
                )
        plans.append(plan)
    return plans


def apply_plan(db: Session, plan: DocTypeClonePlan, *, dry_run: bool) -> None:
    for item in plan.templates:
        if item.action != "clone":
            continue
        if dry_run:
            continue
        dest = models.FlowConfig(
            document_type_id=None,
            template_id=item.template_id,
            version=1,
            is_published=True,
        )
        db.add(dest)
        db.flush()
        copied = copy_flow_steps_and_fields(
            db, source_flow_id=plan.source_flow_id, dest_flow=dest
        )
        item.new_flow_id = dest.id
        item.field_count = copied
        # Verify field_key preservation immediately
        dest_keys = resolvable_field_keys_for_published_flow(db, dest)
        source_keys = set(plan.source_field_keys)
        if dest_keys != source_keys:
            raise RuntimeError(
                f"field_key mismatch after clone template={item.template_id}: "
                f"missing={sorted(source_keys - dest_keys)} "
                f"extra={sorted(dest_keys - source_keys)}"
            )


def format_report(plans: list[DocTypeClonePlan], *, dry_run: bool) -> str:
    lines: list[str] = []
    mode = "DRY-RUN" if dry_run else "APPLY"
    lines.append(f"=== clone_flows_to_templates [{mode}] ===")
    to_clone = sum(
        1 for p in plans for t in p.templates if t.action == "clone"
    )
    skipped = sum(
        1 for p in plans for t in p.templates if t.action == "skip_existing"
    )
    lines.append(
        f"Document types with published shared flow: {len(plans)} | "
        f"templates to clone: {to_clone} | already have template flow: {skipped}"
    )
    lines.append("")
    for plan in plans:
        clone_n = sum(1 for t in plan.templates if t.action == "clone")
        skip_n = sum(1 for t in plan.templates if t.action == "skip_existing")
        lines.append(
            f"DT {plan.document_type_id} [{plan.document_type_name}] "
            f"org={plan.org_id} source_flow={plan.source_flow_id} "
            f"v{plan.source_version} fields={len(plan.source_field_keys)} "
            f"templates={len(plan.templates)} (clone={clone_n}, skip={skip_n})"
        )
        lines.append(
            f"  source field_keys ({len(plan.source_field_keys)}): "
            f"{', '.join(plan.source_field_keys) or '(none)'}"
        )
        for t in plan.templates:
            extra = ""
            if t.new_flow_id is not None:
                extra = f" -> new_flow_id={t.new_flow_id}"
            lines.append(
                f"  - template {t.template_id} "
                f"[{t.display_name}] action={t.action} "
                f"steps={t.step_count} fields={t.field_count}{extra}"
            )
        lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Clone published doc-type flows onto templates (Phase A)."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="Plan and log only; do not write",
    )
    mode.add_argument(
        "--apply",
        action="store_true",
        help="Create per-template FlowConfig clones",
    )
    parser.add_argument(
        "--document-type-id",
        type=int,
        default=None,
        help="Limit to one org_document_types.id",
    )
    parser.add_argument(
        "--name-contains",
        type=str,
        default=None,
        help="Filter document types by name substring (case-insensitive)",
    )
    args = parser.parse_args(argv)
    dry_run = bool(args.dry_run)

    db = SessionLocal()
    try:
        plans = build_plans(
            db,
            document_type_id=args.document_type_id,
            name_contains=args.name_contains,
        )
        for plan in plans:
            apply_plan(db, plan, dry_run=dry_run)
        if not dry_run:
            db.commit()
        print(format_report(plans, dry_run=dry_run))
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

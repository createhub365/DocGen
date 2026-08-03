"""Apply Phase C approved CLEARs (is_mapped=false) — templates 22 + 41."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
_env = ROOT / ".env"
if _env.is_file():
    for line in _env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v

from database import SessionLocal
import models
from routers.platform_scope import resolvable_field_keys_for_published_flow

CLEARS = [
    (22, "passport_expiry", "passport_expiry_date"),
    (41, "client_name", "client_name"),
    (41, "passport_name", "passport_name"),
]


def main() -> int:
    db = SessionLocal()
    try:
        cleared = []
        for tid, ph, fk in CLEARS:
            row = (
                db.query(models.PlaceholderMapping)
                .filter(
                    models.PlaceholderMapping.template_id == tid,
                    models.PlaceholderMapping.placeholder_key == ph,
                    models.PlaceholderMapping.is_mapped.is_(True),
                )
                .one_or_none()
            )
            if not row:
                # maybe already cleared or key mismatch — try by field_key
                row = (
                    db.query(models.PlaceholderMapping)
                    .filter(
                        models.PlaceholderMapping.template_id == tid,
                        models.PlaceholderMapping.placeholder_key == ph,
                    )
                    .one_or_none()
                )
            if not row:
                print(f"MISSING mapping tpl={tid} ph={ph}")
                continue
            if row.field_key != fk:
                print(
                    f"WARN field_key mismatch tpl={tid} ph={ph} "
                    f"expected={fk} actual={row.field_key}"
                )
            row.is_mapped = False
            cleared.append((tid, ph, row.field_key, row.id))
            print(f"CLEARED tpl={tid} ph={ph} field_key={row.field_key} id={row.id}")
        db.commit()

        # Verify orphans against owned published flows
        for tid in (22, 41):
            owned = (
                db.query(models.FlowConfig)
                .filter(
                    models.FlowConfig.template_id == tid,
                    models.FlowConfig.is_published.is_(True),
                )
                .one()
            )
            keys = resolvable_field_keys_for_published_flow(db, owned)
            mapped = (
                db.query(models.PlaceholderMapping)
                .filter(
                    models.PlaceholderMapping.template_id == tid,
                    models.PlaceholderMapping.is_mapped.is_(True),
                )
                .all()
            )
            orphans = [
                (m.placeholder_key, m.field_key)
                for m in mapped
                if (m.field_key or "") not in keys
            ]
            print(
                f"VERIFY tpl={tid} owned_flow={owned.id} "
                f"mapped={len(mapped)} orphans={len(orphans)} {orphans}"
            )
            if orphans:
                raise SystemExit(2)
        print("OK cleared=", cleared)
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

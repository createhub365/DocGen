"""Org-scoped auto reference number allocation (independent of legacy ref_counter)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

import models

# Zero-padded 4 digits: OLAW-2026-0001 … OLAW-2026-9999; :04d grows past 9999
# without truncating (10000 → "10000").
REF_SEQUENCE_WIDTH = 4


def format_org_ref_number(prefix: str, year: int, sequence: int) -> str:
    clean = (prefix or "").strip()
    return f"{clean}-{year}-{sequence:0{REF_SEQUENCE_WIDTH}d}"


def get_next_ref_number(
    db: Session,
    org_id: str,
    document_type_id: int,
    prefix: str,
    *,
    year: int | None = None,
) -> str:
    """
    Atomically allocate the next ref for (org, document_type, year).

    Uses INSERT … ON CONFLICT DO UPDATE … RETURNING so concurrent callers
    cannot get the same sequence (works on Postgres and modern SQLite).
    Does not commit — caller owns the transaction.
    """
    clean_prefix = (prefix or "").strip()
    if not clean_prefix:
        raise ValueError("prefix is required")

    target_year = int(year) if year is not None else datetime.now(timezone.utc).year
    table = models.OrgRefCounter.__table__
    dialect = db.get_bind().dialect.name

    values = {
        "org_id": org_id,
        "document_type_id": document_type_id,
        "year": target_year,
        "last_sequence": 1,
    }
    if dialect == "postgresql":
        stmt = pg_insert(table).values(**values)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_org_ref_counters_org_type_year",
            set_={"last_sequence": table.c.last_sequence + 1},
        ).returning(table.c.last_sequence)
    else:
        # SQLite (tests) and any other dialect supporting upsert
        stmt = sqlite_insert(table).values(**values)
        stmt = stmt.on_conflict_do_update(
            index_elements=["org_id", "document_type_id", "year"],
            set_={"last_sequence": table.c.last_sequence + 1},
        ).returning(table.c.last_sequence)

    seq = db.execute(stmt).scalar_one()
    db.flush()
    return format_org_ref_number(clean_prefix, target_year, int(seq))

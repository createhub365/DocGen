"""Backfill platform GeneratedDocument files from local disk → Supabase Storage.

Only touches org-scoped rows (org_id IS NOT NULL). Does not touch legacy
immigration docs (org_id IS NULL) and does not regenerate missing files.

Usage (from backend/):
  python -m scripts.backfill_generated_to_supabase
  python -m scripts.backfill_generated_to_supabase --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys

# Allow running as `python -m scripts....` from backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

# Support DATABASE_URL without embedded password + separate DATABASE_PASSWORD
_url = os.getenv("DATABASE_URL", "")
_pw = os.getenv("DATABASE_PASSWORD", "")
if _url and _pw and "://" in _url and "@" in _url:
    from urllib.parse import quote_plus

    scheme, rest = _url.split("://", 1)
    user, hostpart = rest.split("@", 1)
    if ":" not in user:
        os.environ["DATABASE_URL"] = (
            f"{scheme}://{user}:{quote_plus(_pw)}@{hostpart}"
        )

from database import SessionLocal  # noqa: E402
import models  # noqa: E402
from services.logo_storage import (  # noqa: E402
    DOCX_MIME,
    is_remote_path,
    storage_enabled,
)
from services.generated_document_storage import (  # noqa: E402
    GeneratedDocumentStorageError,
    upload_generated_bytes,
    unlink_local_quiet,
)
from utils.file_utils import safe_join_relative  # noqa: E402
from fastapi import HTTPException  # noqa: E402


def _local_abs(output_dir: str, stored: str | None) -> str | None:
    if not stored or is_remote_path(stored):
        return None
    try:
        return safe_join_relative(output_dir, stored.replace("\\", "/"))
    except HTTPException:
        return None


def backfill(*, dry_run: bool = False) -> dict:
    output_dir = os.getenv("OUTPUT_DIR", "./output")
    if not storage_enabled() and not dry_run:
        raise SystemExit(
            "Supabase Storage not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
        )

    db = SessionLocal()
    stats = {
        "total_org_docs": 0,
        "already_remote": 0,
        "recovered": 0,
        "permanently_unavailable": 0,
        "errors": 0,
        "unavailable_ids": [],
        "recovered_ids": [],
    }
    try:
        rows = (
            db.query(models.GeneratedDocument)
            .filter(models.GeneratedDocument.org_id.isnot(None))
            .order_by(models.GeneratedDocument.id.asc())
            .all()
        )
        stats["total_org_docs"] = len(rows)

        for doc in rows:
            docx_remote = is_remote_path(doc.docx_filename)
            pdf_remote = is_remote_path(doc.pdf_filename)
            # Count as already remote if any stored path that should exist is remote,
            # or both are None.
            needs_docx = bool(doc.docx_filename) and not docx_remote
            needs_pdf = bool(doc.pdf_filename) and not pdf_remote
            if not needs_docx and not needs_pdf:
                if doc.docx_filename or doc.pdf_filename:
                    stats["already_remote"] += 1
                continue

            local_docx = _local_abs(output_dir, doc.docx_filename) if needs_docx else None
            local_pdf = _local_abs(output_dir, doc.pdf_filename) if needs_pdf else None

            docx_exists = bool(local_docx and os.path.exists(local_docx))
            pdf_exists = bool(local_pdf and os.path.exists(local_pdf))

            # Recoverable if at least one needed local file still exists
            can_recover = (needs_docx and docx_exists) or (needs_pdf and pdf_exists)
            if not can_recover:
                # Nothing on disk for the local paths we still need
                if needs_docx or needs_pdf:
                    stats["permanently_unavailable"] += 1
                    stats["unavailable_ids"].append(doc.id)
                continue

            if dry_run:
                stats["recovered"] += 1
                stats["recovered_ids"].append(doc.id)
                continue

            try:
                if needs_docx and docx_exists:
                    with open(local_docx, "rb") as fh:
                        content = fh.read()
                    ref = upload_generated_bytes(
                        org_id=doc.org_id,
                        document_id=doc.id,
                        ext="docx",
                        content=content,
                        content_type=DOCX_MIME,
                    )
                    doc.docx_filename = ref
                    unlink_local_quiet(local_docx)
                elif needs_docx and not docx_exists:
                    # Leave path as-is (unavailable); still try PDF
                    pass

                if needs_pdf and pdf_exists:
                    with open(local_pdf, "rb") as fh:
                        content = fh.read()
                    ref = upload_generated_bytes(
                        org_id=doc.org_id,
                        document_id=doc.id,
                        ext="pdf",
                        content=content,
                        content_type="application/pdf",
                    )
                    doc.pdf_filename = ref
                    unlink_local_quiet(local_pdf)

                db.commit()
                stats["recovered"] += 1
                stats["recovered_ids"].append(doc.id)

                # If we still have a local path that wasn't recovered, count unavailable
                still_local_missing = (
                    (doc.docx_filename and not is_remote_path(doc.docx_filename)
                     and not _local_abs(output_dir, doc.docx_filename))
                    or (doc.pdf_filename and not is_remote_path(doc.pdf_filename)
                        and not (_local_abs(output_dir, doc.pdf_filename)
                                 and os.path.exists(_local_abs(output_dir, doc.pdf_filename) or ""))
                       )
                )
                # Simpler: if after recover any column still local and file missing
                for attr in ("docx_filename", "pdf_filename"):
                    path = getattr(doc, attr)
                    if path and not is_remote_path(path):
                        abs_p = _local_abs(output_dir, path)
                        if not abs_p or not os.path.exists(abs_p):
                            if doc.id not in stats["unavailable_ids"]:
                                stats["permanently_unavailable"] += 1
                                stats["unavailable_ids"].append(doc.id)
                            break
            except GeneratedDocumentStorageError as exc:
                db.rollback()
                stats["errors"] += 1
                print(f"ERROR doc id={doc.id}: {exc}", file=sys.stderr)
    finally:
        db.close()
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be recovered without uploading",
    )
    args = parser.parse_args()
    stats = backfill(dry_run=args.dry_run)
    print("=== Backfill generated documents → Supabase Storage ===")
    print(f"dry_run={args.dry_run}")
    print(f"total_org_docs={stats['total_org_docs']}")
    print(f"already_remote={stats['already_remote']}")
    print(f"recovered={stats['recovered']}")
    print(f"permanently_unavailable={stats['permanently_unavailable']}")
    print(f"errors={stats['errors']}")
    if stats["unavailable_ids"]:
        ids = stats["unavailable_ids"]
        preview = ids[:40]
        more = f" ... (+{len(ids) - 40})" if len(ids) > 40 else ""
        print(f"unavailable_ids={preview}{more}")
    if stats["recovered_ids"]:
        print(f"recovered_ids={stats['recovered_ids']}")


if __name__ == "__main__":
    main()

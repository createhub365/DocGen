"""
Bulk employer import from CSV file.

CSV columns (company_name required):
  company_name, trading_name, country, city, address,
  state, postcode, email, website,
  hr_contact_name, hr_contact_title, hr_email,
  signatory_name, signatory_designation,
  accreditation_no, reg_number_label, reg_number_value

Usage:
  cd backend
  python scripts/import_employers.py --file employers.csv
  python scripts/import_employers.py --file employers.csv --dry-run
  python scripts/import_employers.py --file employers.csv --update

Options:
  --dry-run        Preview without saving
  --update         Update existing employers (match by company_name)
  (default)        Skip if company_name already exists
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from services.employer_import import import_employers_from_file, parse_csv_text


def import_employers(filepath: str, dry_run: bool = False, update_existing: bool = False):
    if not os.path.exists(filepath):
        print(f"ERROR: File not found: {filepath}")
        sys.exit(1)

    with open(filepath, newline="", encoding="utf-8-sig") as handle:
        text = handle.read()

    try:
        rows = parse_csv_text(text)
    except ValueError as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)

    print(f"\nFound {len(rows)} valid rows in {filepath}")
    if dry_run:
        print("DRY RUN — nothing will be saved\n")

    db = SessionLocal()
    try:
        result = import_employers_from_file(
            db,
            filepath,
            dry_run=dry_run,
            update_existing=update_existing,
        )
    finally:
        db.close()

    details = result["details"]
    for name in details["added"]:
        print(f"  ADDED: {name}")
    for name in details["updated"]:
        print(f"  UPDATED: {name}")
    for name in details["skipped"]:
        print(f"  SKIP: '{name}' already exists")
    for err in details["errors"]:
        print(f"  ERROR: {err}")

    summary = result["summary"]
    print(f"\n{'DRY RUN ' if dry_run else ''}Results:")
    print(f"  Added:   {summary['added']}")
    print(f"  Updated: {summary['updated']}")
    print(f"  Skipped: {summary['skipped']}")
    print(f"  Errors:  {summary['errors']}")
    print(f"  Total:   {len(rows)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Import employers from CSV into DocGen Pro database"
    )
    parser.add_argument("--file", "-f", required=True, help="Path to CSV file")
    parser.add_argument("--dry-run", action="store_true", help="Preview without saving")
    parser.add_argument(
        "--update",
        action="store_true",
        help="Update existing employers (match by company_name)",
    )
    args = parser.parse_args()

    import_employers(
        filepath=args.file,
        dry_run=args.dry_run,
        update_existing=args.update,
    )

import csv
import io
import os
from datetime import datetime

from sqlalchemy.orm import Session

from services.country_employer_config import default_reg_number_label

MAX_EMPLOYER_CSV_SIZE = 5 * 1024 * 1024
REQUIRED_CSV_COLUMNS = {"company_name"}


def clean(val) -> str:
    if val is None:
        return ""
    return str(val).strip()


def row_to_employer_data(row: dict) -> dict:
    country = clean(row.get("country", ""))
    reg_label = clean(row.get("reg_number_label", ""))
    if not reg_label and country:
        reg_label = default_reg_number_label(country)

    return {
        "company_name": clean(row.get("company_name", "")),
        "company_trading_name": clean(row.get("trading_name", "")),
        "country": country,
        "industry": clean(row.get("industry", "")),
        "company_city": clean(row.get("city", "")),
        "company_address": clean(row.get("address", "")),
        "company_state": clean(row.get("state", "")),
        "company_postcode": clean(row.get("postcode", "")),
        "company_email": clean(row.get("email", "")),
        "company_website": clean(row.get("website", "")),
        "hr_contact_name": clean(row.get("hr_contact_name", "")),
        "hr_contact_title": clean(row.get("hr_contact_title", "")),
        "hr_email": clean(row.get("hr_email", "")),
        "signatory_name": clean(row.get("signatory_name", "")),
        "signatory_designation": clean(row.get("signatory_designation", "")),
        "employer_accreditation_no": clean(row.get("accreditation_no", "")),
        "reg_number_label": reg_label or "Registration No.",
        "reg_number_value": clean(row.get("reg_number_value", "")),
    }


def parse_csv_text(text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("CSV is empty")
    if not REQUIRED_CSV_COLUMNS.issubset(set(reader.fieldnames)):
        missing = REQUIRED_CSV_COLUMNS - set(reader.fieldnames)
        raise ValueError(f"Missing required columns: {missing}")

    rows = []
    for i, row in enumerate(reader, start=2):
        company = clean(row.get("company_name", ""))
        if not company:
            continue
        rows.append(row)
    return rows


def import_employer_rows(
    db: Session,
    rows: list[dict],
    *,
    dry_run: bool = False,
    update_existing: bool = False,
) -> dict:
    results = {
        "added": [],
        "updated": [],
        "skipped": [],
        "errors": [],
    }

    for row in rows:
        employer_data = row_to_employer_data(row)
        company_name = employer_data["company_name"]
        if not company_name:
            continue

        existing = (
            db.query(models.Employer)
            .filter(models.Employer.company_name == company_name)
            .first()
        )

        if existing and not update_existing:
            results["skipped"].append(company_name)
            continue

        if dry_run:
            if existing:
                results["updated"].append(company_name)
            else:
                results["added"].append(company_name)
            continue

        try:
            if existing and update_existing:
                for key, val in employer_data.items():
                    if val:
                        setattr(existing, key, val)
                existing.updated_at = datetime.utcnow()
                db.commit()
                results["updated"].append(company_name)
            else:
                db.add(models.Employer(**employer_data))
                db.commit()
                results["added"].append(company_name)
        except Exception as exc:
            db.rollback()
            results["errors"].append(f"{company_name}: {str(exc)[:100]}")

    return {
        "dry_run": dry_run,
        "summary": {
            "added": len(results["added"]),
            "updated": len(results["updated"]),
            "skipped": len(results["skipped"]),
            "errors": len(results["errors"]),
        },
        "details": results,
    }


def import_employers_from_file(
    db: Session,
    filepath: str,
    *,
    dry_run: bool = False,
    update_existing: bool = False,
) -> dict:
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")
    if not filepath.lower().endswith(".csv"):
        raise ValueError("File must be .csv")

    with open(filepath, newline="", encoding="utf-8-sig") as handle:
        text = handle.read()

    rows = parse_csv_text(text)
    return import_employer_rows(
        db,
        rows,
        dry_run=dry_run,
        update_existing=update_existing,
    )

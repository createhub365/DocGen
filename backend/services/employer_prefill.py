import os

from services.trade_bank import COUNTRY_REG_PLACEHOLDER, get_trade_details
from services.occupation_codes import get_occupation_code_for_country_name


def employer_to_form_fields(employer) -> dict:
    parts = [employer.company_address, employer.company_city]
    if employer.company_state:
        parts.append(employer.company_state)
    if employer.company_postcode:
        parts.append(employer.company_postcode)

    fields = {
        "company_name": employer.company_name,
        "company_trading_name": employer.company_trading_name or "",
        "company_address": employer.company_address,
        "company_city": employer.company_city,
        "company_email": employer.company_email,
        "company_reg_address": ", ".join(p for p in parts if p),
        "hr_contact_name": employer.hr_contact_name,
        "hr_contact_title": employer.hr_contact_title,
        "hr_email": employer.hr_email,
        "signatory_name": employer.signatory_name,
        "signatory_designation": employer.signatory_designation,
        "employer_accreditation_no": employer.employer_accreditation_no or "",
    }

    reg_key = COUNTRY_REG_PLACEHOLDER.get(employer.country)
    if reg_key and employer.reg_number_value:
        fields[reg_key] = employer.reg_number_value
    elif employer.reg_number_value:
        fields["reg_number_value"] = employer.reg_number_value

    return fields


def merge_generation_fields(
    employer,
    trade: str | None,
    country: str | None,
    trade_category: str | None,
    user_fields: dict,
) -> tuple[dict, dict | None]:
    merged = employer_to_form_fields(employer) if employer else {}
    trade_info = None
    if trade and country:
        trade_info = get_trade_details(country, trade, trade_category)
        if trade_info:
            merged["position_title"] = trade_info["trade_name"]
            occ = get_occupation_code_for_country_name(trade_info, country)
            merged["occupation_system"] = occ["system"]
            merged["occupation_code"] = occ["code"]
            merged["occupation_title"] = occ["title"]
            merged["anzsco_code"] = trade_info.get("anzsco_code") or occ["code"]

    for key, value in user_fields.items():
        if value is not None and value != "":
            merged[key] = value

    return merged, trade_info


def employer_logo_path(employer, logo_dir: str) -> str | None:
    if not employer or not employer.company_logo_path:
        return None
    from services.logo_storage import resolve_logo_local_path

    return resolve_logo_local_path(employer.company_logo_path, logo_dir)

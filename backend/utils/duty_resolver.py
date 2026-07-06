"""Resolve trade duties by country — generic vs country-specific layers."""
from __future__ import annotations

from typing import Any

ANZSCO_COUNTRIES = frozenset({"NZ", "AU"})
GULF_COUNTRIES = frozenset({"AE", "SA", "QA", "KW", "BH", "OM"})

NZ_TERM_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("Health and Safety at Work Act 2015 (HSWA)", "applicable health and safety legislation"),
    ("HSWA 2015", "local health and safety legislation"),
    ("HSWA", "local health and safety legislation"),
    ("New Zealand Building Code (NZBC)", "applicable building codes and standards"),
    ("New Zealand Building Code", "applicable building codes"),
    ("NZBC", "applicable building codes"),
    ("NZS 3000", "applicable electrical wiring standards"),
    ("NZS 3604", "applicable plumbing standards"),
    ("NZS 4210", "applicable masonry standards"),
    ("NZS 1554", "applicable welding standards"),
    ("AS/NZS", "applicable Australian/NZ standards"),
    ("NZS ", "applicable standards "),
    ("WorkSafe New Zealand", "the relevant safety authority"),
    ("WorkSafe NZ", "the relevant safety authority"),
    ("Immigration New Zealand", "the relevant immigration authority"),
    ("Immigration NZ", "the relevant immigration authority"),
    ("KiwiSaver", "applicable pension/retirement scheme"),
    ("Holidays Act 2003", "applicable employment legislation"),
    ("Employment Relations Act 2000", "applicable employment legislation"),
    ("Building Act 2004", "applicable building legislation"),
    ("Gas Act 1992", "applicable gas legislation"),
    ("Ozone Layer Protection Act 1996", "applicable environmental legislation"),
    ("upon arrival in New Zealand", "upon commencement"),
    ("in New Zealand", "locally"),
    ("New Zealand workplaces", "local workplaces"),
    ("New Zealand", "the destination country"),
    ("IRD", "local tax authority"),
    ("EWRB", "relevant electrical licensing authority"),
    ("PGDB", "relevant plumbing licensing authority"),
    ("LINZ", "relevant land information authority"),
    ("NZ ", "local "),
)


def make_duties_generic(duties: list[str]) -> list[str]:
    """Convert NZ-specific duty text to internationally neutral wording."""
    generic: list[str] = []
    for duty in duties:
        text = duty
        for nz_term, generic_term in NZ_TERM_REPLACEMENTS:
            text = text.replace(nz_term, generic_term)
        generic.append(text)
    return generic


def resolve_duties(trade: dict[str, Any], country_code: str) -> list[str]:
    """
    Return duties appropriate for the given ISO country code.
    Priority: exact country → GULF region → generic → legacy duties field.
    """
    code = (country_code or "").upper()
    duties_by_country = trade.get("duties_by_country") or {}
    generic_duties = trade.get("duties_generic") or trade.get("duties") or []

    if code in duties_by_country and duties_by_country[code]:
        return list(duties_by_country[code])

    if code in ANZSCO_COUNTRIES:
        nz_duties = duties_by_country.get("NZ") or duties_by_country.get("AU")
        if nz_duties:
            return list(nz_duties)

    if code in GULF_COUNTRIES and duties_by_country.get("GULF"):
        return list(duties_by_country["GULF"])

    if generic_duties:
        return list(generic_duties)

    return list(trade.get("duties") or [])

"""Static starter-kit presets for platform orgs.

These definitions are version-controlled code — NOT live reads from legacy
immigration tables. Editing countries/trades/templates later must not change
what a new org installs.
"""

from __future__ import annotations

from typing import Any

# Catalog entry shown by GET /api/platform/presets
PRESET_CATALOG: list[dict[str, str]] = [
    {
        "key": "immigration_starter",
        "name": "Immigration starter kit",
        "description": (
            "Offer Letter and Employment Contract document types with "
            "country/employer selector steps and common candidate fields. "
            "Structure only — no legacy data or template files are copied."
        ),
    },
]

# Structure-only content for immigration_starter.
# Field keys align with common legacy placeholder aliases (cand_name,
# joining_date, salary, position/job title, duration) so mapping feels familiar.
IMMIGRATION_STARTER: dict[str, Any] = {
    "key": "immigration_starter",
    "document_types": [
        {
            "name": "Offer Letter",
            "slug": "offer-letter",
            "description": (
                "Employment offer letter flow with country and employer "
                "selection plus candidate offer details."
            ),
            "steps": [
                {
                    "step_type": "country_selector",
                    "label": "Country",
                    "is_enabled": True,
                    "order_index": 0,
                    "fields": [],
                },
                {
                    "step_type": "party_selector",
                    "label": "Employer",
                    "is_enabled": True,
                    "order_index": 1,
                    "fields": [],
                },
                {
                    "step_type": "custom_fields",
                    "label": "Offer details",
                    "is_enabled": True,
                    "order_index": 2,
                    "fields": [
                        {
                            "field_key": "cand_name",
                            "field_label": "Candidate name",
                            "field_type": "text",
                            "is_required": True,
                        },
                        {
                            "field_key": "joining_date",
                            "field_label": "Joining date",
                            "field_type": "date",
                            "is_required": True,
                        },
                        {
                            "field_key": "salary",
                            "field_label": "Salary",
                            "field_type": "number",
                            "is_required": True,
                        },
                        {
                            "field_key": "job_title",
                            "field_label": "Job title",
                            "field_type": "text",
                            "is_required": True,
                        },
                    ],
                },
            ],
        },
        {
            "name": "Employment Contract",
            "slug": "employment-contract",
            "description": (
                "Employment contract flow with employer selection and "
                "contract terms. Country selector is disabled by default."
            ),
            "steps": [
                {
                    "step_type": "country_selector",
                    "label": "Country",
                    "is_enabled": False,
                    "order_index": 0,
                    "fields": [],
                },
                {
                    "step_type": "party_selector",
                    "label": "Employer",
                    "is_enabled": True,
                    "order_index": 1,
                    "fields": [],
                },
                {
                    "step_type": "custom_fields",
                    "label": "Contract details",
                    "is_enabled": True,
                    "order_index": 2,
                    "fields": [
                        {
                            "field_key": "cand_name",
                            "field_label": "Candidate name",
                            "field_type": "text",
                            "is_required": True,
                        },
                        {
                            "field_key": "job_title",
                            "field_label": "Job title",
                            "field_type": "text",
                            "is_required": True,
                        },
                        {
                            "field_key": "start_date",
                            "field_label": "Start date",
                            "field_type": "date",
                            "is_required": True,
                        },
                        {
                            "field_key": "contract_duration",
                            "field_label": "Contract duration",
                            "field_type": "text",
                            "is_required": True,
                        },
                    ],
                },
            ],
        },
    ],
}

PRESETS_BY_KEY: dict[str, dict[str, Any]] = {
    IMMIGRATION_STARTER["key"]: IMMIGRATION_STARTER,
}


def get_preset(preset_key: str) -> dict[str, Any] | None:
    return PRESETS_BY_KEY.get(preset_key)

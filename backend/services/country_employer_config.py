import json
import os

_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "data",
    "country_employer_config.json",
)

_COUNTRY_ALIASES = {
    "United Arab Emirates": "UAE",
    "UAE": "UAE",
    "UK": "United Kingdom",
}

_config_cache: dict | None = None


def get_country_employer_config() -> dict:
    global _config_cache
    if _config_cache is None:
        with open(_CONFIG_PATH, encoding="utf-8") as handle:
            _config_cache = json.load(handle)
    return _config_cache


def resolve_country_config_key(country_name: str) -> str:
    if not country_name:
        return ""
    return _COUNTRY_ALIASES.get(country_name.strip(), country_name.strip())


def get_country_employer_fields(country_name: str) -> dict:
    config = get_country_employer_config()
    key = resolve_country_config_key(country_name)
    return config.get(key, config.get("default", {}))


def default_reg_number_label(country_name: str) -> str:
    fields = get_country_employer_fields(country_name)
    return fields.get("reg_number_label") or "Registration No."

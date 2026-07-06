"""Bake trade_occupation_codes.json mappings into complete_trade_bank.json."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from services.occupation_codes import (  # noqa: E402
    BANK_TRADE_ALIASES,
    _load_occupation_code_mappings,
    _mapping_lookup,
    apply_occupation_code_mappings,
)

BANK_PATH = ROOT / "data" / "complete_trade_bank.json"


def main() -> None:
    mappings = _load_occupation_code_mappings()
    with open(BANK_PATH, encoding="utf-8") as f:
        data = json.load(f)

    applied = 0
    missing = []
    for ind in data.get("industries", []):
        for cat in ind.get("categories", []):
            for i, trade in enumerate(cat.get("trades", [])):
                name = trade.get("trade", "")
                if _mapping_lookup(name, mappings):
                    updated = apply_occupation_code_mappings(trade)
                    cat["trades"][i] = updated
                    applied += 1
                else:
                    missing.append(name)

    with open(BANK_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    unique_missing = sorted(set(missing))
    print(f"Applied occupation codes to {applied} trades")
    print(f"Unmapped trades ({len(unique_missing)}):")
    for name in unique_missing:
        alias = BANK_TRADE_ALIASES.get(name, "")
        print(f"  - {name}" + (f" (alias -> {alias})" if alias else ""))


if __name__ == "__main__":
    main()

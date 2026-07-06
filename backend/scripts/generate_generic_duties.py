"""Generate generic duty layers for all trades in complete_trade_bank.json."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from utils.duty_resolver import make_duties_generic

BANK_PATH = ROOT / "data" / "complete_trade_bank.json"


def process_trade(trade: dict) -> bool:
    nz_duties = list(trade.get("duties") or [])
    if not nz_duties:
        return False

    generic_duties = make_duties_generic(nz_duties)
    trade["duties_generic"] = generic_duties
    trade["duties_by_country"] = {
        "NZ": nz_duties,
        "AU": nz_duties,
    }
    return True


def main() -> None:
    with open(BANK_PATH, encoding="utf-8") as f:
        trade_bank = json.load(f)

    updated = 0
    for industry in trade_bank.get("industries", []):
        for category in industry.get("categories", []):
            for trade in category.get("trades", []):
                if process_trade(trade):
                    updated += 1

    meta = trade_bank.setdefault("meta", {})
    meta["duties_layer_version"] = "2.0"

    with open(BANK_PATH, "w", encoding="utf-8") as f:
        json.dump(trade_bank, f, indent=2, ensure_ascii=False)

    print(f"Generic duties generated for {updated} trades -> {BANK_PATH}")


if __name__ == "__main__":
    main()

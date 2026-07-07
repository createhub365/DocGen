"""Generate countries/trades/companies SQL for Supabase seed."""
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

from seed import SEED_DATA  # noqa: E402


def esc(value: str) -> str:
    return value.replace("'", "''")


def main():
    parts = []
    cid = 1
    tid = 1
    compid = 1

    for code, data in SEED_DATA.items():
        parts.append(
            f"INSERT INTO countries (id, name, code) VALUES "
            f"({cid}, '{esc(data['name'])}', '{code}');"
        )
        for trade_name, companies in data["trades"].items():
            parts.append(
                f"INSERT INTO trades (id, name, country_id) VALUES "
                f"({tid}, '{esc(trade_name)}', {cid});"
            )
            for company_name in companies:
                parts.append(
                    f"INSERT INTO companies (id, name, trade_id, country_id) VALUES "
                    f"({compid}, '{esc(company_name)}', {tid}, {cid});"
                )
                compid += 1
            tid += 1
        cid += 1

    parts.append(
        "SELECT setval(pg_get_serial_sequence('countries','id'), "
        "(SELECT COALESCE(MAX(id),1) FROM countries));"
    )
    parts.append(
        "SELECT setval(pg_get_serial_sequence('trades','id'), "
        "(SELECT COALESCE(MAX(id),1) FROM trades));"
    )
    parts.append(
        "SELECT setval(pg_get_serial_sequence('companies','id'), "
        "(SELECT COALESCE(MAX(id),1) FROM companies));"
    )

    out = os.path.join(os.path.dirname(__file__), "seed_countries.sql")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))
    print(out)
    print("statements:", len(parts))


if __name__ == "__main__":
    main()

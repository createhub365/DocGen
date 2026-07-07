"""
Apply DocGen schema + seed data to Supabase PostgreSQL.

Usage (from backend/):
  1. Set DATABASE_URL in .env to your Supabase connection string
  2. python scripts/setup_supabase.py
"""
import os
import sys

from dotenv import load_dotenv
from sqlalchemy import text

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

load_dotenv(os.path.join(BACKEND_DIR, ".env"))

from database import engine, DATABASE_URL, Base  # noqa: E402
import models  # noqa: F401, E402

ALEMBIC_HEAD = "e5f6a7b8c0d1"


def _require_postgres():
    if DATABASE_URL.startswith("sqlite"):
        print("ERROR: DATABASE_URL still points to SQLite.")
        print("Set Supabase URI in backend/.env:")
        print(
            "DATABASE_URL=postgresql://postgres.azhajzsruwvnffuwlvmy:[PASSWORD]"
            "@aws-0-[region].pooler.supabase.com:6543/postgres"
        )
        sys.exit(1)


def apply_schema():
    Base.metadata.create_all(bind=engine, checkfirst=True)

    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS alembic_version "
                "(version_num VARCHAR(32) NOT NULL PRIMARY KEY)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO alembic_version (version_num) VALUES (:v) "
                "ON CONFLICT (version_num) DO NOTHING"
            ),
            {"v": ALEMBIC_HEAD},
        )


def verify_tables():
    expected = {
        "users",
        "countries",
        "trades",
        "companies",
        "document_types",
        "templates",
        "employers",
        "ref_counter",
        "company_logos",
        "generated_documents",
    }
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public'"
            )
        ).fetchall()
    found = {row[0] for row in rows}
    missing = expected - found
    if missing:
        print(f"WARNING: missing tables: {', '.join(sorted(missing))}")
        return False
    print(f"OK: {len(expected)} DocGen tables present.")
    return True


def run_seed():
    from seed import seed

    seed()


def main():
    _require_postgres()
    host = DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else "postgres"
    print(f"Connecting to: {host}")

    print("Applying schema...")
    apply_schema()

    print("Verifying tables...")
    if not verify_tables():
        sys.exit(1)

    print("Seeding demo data...")
    run_seed()

    print("Supabase setup complete.")


if __name__ == "__main__":
    main()

"""Scripted walkthrough: invite → role change → last-admin block → remove staff.

Verified paths (main.py prefix /api/platform + org_users.router):
  POST   /api/platform/users/invite
  GET    /api/platform/users
  PATCH  /api/platform/users/{org_user_id}/role
  DELETE /api/platform/users/{org_user_id}

Run from backend/:
  python scripts/verify_users_ui_api.py
"""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET"] = (
    "test_jwt_secret_for_platform_isolation_tests_only_64chars_xx"
)
os.environ["ENVIRONMENT"] = "development"
os.environ["ALLOW_DEMO_SEED"] = "false"
os.environ["DOCGEN_SKIP_PDF"] = "true"
os.environ["PLATFORM_SIGNUP_RATE_LIMIT"] = "1000/hour"
os.environ["PLATFORM_LOGIN_RATE_LIMIT"] = "1000/minute"
os.environ["PLATFORM_INVITE_RATE_LIMIT"] = "1000/hour"

_TEST_FILE_ROOT = Path(tempfile.mkdtemp(prefix="docgen_users_walk_"))
_TEST_TEMPLATE_DIR = _TEST_FILE_ROOT / "template_store"
_TEST_OUTPUT_DIR = _TEST_FILE_ROOT / "output"
_TEST_TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
_TEST_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
os.environ["TEMPLATE_DIR"] = str(_TEST_TEMPLATE_DIR)
os.environ["OUTPUT_DIR"] = str(_TEST_OUTPUT_DIR)

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import database  # noqa: E402
from database import Base, get_db  # noqa: E402

_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(_engine, "connect")
def _fk_on(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


database.engine = _engine
database.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

import models  # noqa: E402,F401
from auth import create_org_jwt, hash_password  # noqa: E402
from main import app  # noqa: E402
from models import Organization, OrgUser, User  # noqa: E402

SessionLocal = database.SessionLocal
Base.metadata.create_all(bind=_engine)


def _override():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def main() -> int:
    app.dependency_overrides[get_db] = _override
    db = SessionLocal()
    try:
        admin = User(
            username="walk-admin@example.com",
            email="walk-admin@example.com",
            full_name="Walk Admin",
            password_hash=hash_password("WalkAdmin1!"),
            role="staff",
            is_active=True,
        )
        db.add(admin)
        db.flush()
        org = Organization(name="Walk Org", slug="walk-users-org", is_active=True)
        db.add(org)
        db.flush()
        membership = OrgUser(org_id=org.id, user_id=admin.id, role="org_admin")
        db.add(membership)
        db.commit()
        token = create_org_jwt(user_id=admin.id, org_id=org.id, role="org_admin")
        admin_membership_id = membership.id
    finally:
        db.close()

    client = TestClient(app)
    client.cookies.set("platform_access_token", token)

    print("1) LIST (initial)")
    listed = client.get("/api/platform/users")
    assert listed.status_code == 200, listed.text
    assert any(r["username"] == "walk-admin@example.com" for r in listed.json())
    print("   ok", len(listed.json()), "member(s)")

    print("2) INVITE staff")
    invite = client.post(
        "/api/platform/users/invite",
        json={"email": "walk-staff@example.com", "role": "staff"},
    )
    assert invite.status_code == 201, invite.text
    body = invite.json()
    assert body["temporary_password"]
    staff_id = body["membership"]["id"]
    print("   ok temp_password present, membership", staff_id)

    print("3) CHANGE role staff -> org_admin then back")
    patched = client.patch(
        f"/api/platform/users/{staff_id}/role",
        json={"role": "org_admin"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["role"] == "org_admin"
    demote_staff_back = client.patch(
        f"/api/platform/users/{staff_id}/role",
        json={"role": "staff"},
    )
    assert demote_staff_back.status_code == 200, demote_staff_back.text
    print("   ok")

    print("4) LAST-ADMIN guard")
    blocked_role = client.patch(
        f"/api/platform/users/{admin_membership_id}/role",
        json={"role": "staff"},
    )
    assert blocked_role.status_code == 400, blocked_role.text
    assert "last org_admin" in blocked_role.json()["detail"].lower()
    print("   blocked demote:", blocked_role.json()["detail"])

    blocked_del = client.delete(f"/api/platform/users/{admin_membership_id}")
    assert blocked_del.status_code == 400, blocked_del.text
    print("   blocked delete:", blocked_del.json()["detail"])

    print("5) REMOVE non-last staff")
    removed = client.delete(f"/api/platform/users/{staff_id}")
    assert removed.status_code == 204, removed.text
    after = client.get("/api/platform/users").json()
    assert all(r["id"] != staff_id for r in after)
    print("   ok removed; remaining", len(after))

    print("PASS verify_users_ui_api")
    return 0


if __name__ == "__main__":
    try:
        code = main()
    finally:
        shutil.rmtree(_TEST_FILE_ROOT, ignore_errors=True)
        app.dependency_overrides.clear()
    raise SystemExit(code)

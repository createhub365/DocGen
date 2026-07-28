"""Staff vs admin: /me role differs; staff admin APIs get 403; isOrgAdmin helper contract.

Also documents the frontend gating source of truth (utils/platformRoles.isOrgAdmin).

Run from backend/:
  python scripts/verify_staff_admin_role_gates.py
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

_TEST_FILE_ROOT = Path(tempfile.mkdtemp(prefix="docgen_role_gates_"))
os.environ["TEMPLATE_DIR"] = str(_TEST_FILE_ROOT / "template_store")
os.environ["OUTPUT_DIR"] = str(_TEST_FILE_ROOT / "output")
Path(os.environ["TEMPLATE_DIR"]).mkdir(parents=True, exist_ok=True)
Path(os.environ["OUTPUT_DIR"]).mkdir(parents=True, exist_ok=True)

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


def _frontend_is_org_admin(role: str | None) -> bool:
    """Mirror frontend/src/utils/platformRoles.js isOrgAdmin(string)."""
    return role == "org_admin"


def main() -> int:
    app.dependency_overrides[get_db] = _override
    db = SessionLocal()
    try:
        admin = User(
            username="gate-admin@example.com",
            email="gate-admin@example.com",
            full_name="Gate Admin",
            password_hash=hash_password("AdminPass1!"),
            role="staff",
            is_active=True,
        )
        db.add(admin)
        db.flush()
        org = Organization(name="Gate Org", slug="gate-role-org", is_active=True)
        db.add(org)
        db.flush()
        db.add(OrgUser(org_id=org.id, user_id=admin.id, role="org_admin"))
        db.commit()
        admin_token = create_org_jwt(
            user_id=admin.id, org_id=org.id, role="org_admin"
        )
        org_id = org.id
    finally:
        db.close()

    admin_client = TestClient(app)
    admin_client.cookies.set("platform_access_token", admin_token)

    print("1) Admin GET /me")
    admin_me = admin_client.get("/api/platform/me")
    assert admin_me.status_code == 200, admin_me.text
    admin_body = admin_me.json()
    print("   shape keys:", sorted(admin_body.keys()))
    print("   role=", admin_body.get("role"), "membership.role=", admin_body.get("membership", {}).get("role"))
    assert admin_body["role"] == "org_admin"
    assert admin_body["membership"]["role"] == "org_admin"
    assert _frontend_is_org_admin(admin_body["role"]) is True
    assert _frontend_is_org_admin(admin_body.get("membership", {}).get("role")) is True

    print("2) Invite staff + login")
    invite = admin_client.post(
        "/api/platform/users/invite",
        json={"email": "gate-staff@example.com", "role": "staff"},
    )
    assert invite.status_code == 201, invite.text
    temp_pw = invite.json()["temporary_password"]

    login_client = TestClient(app)
    app.dependency_overrides[get_db] = _override
    login = login_client.post(
        "/api/platform/login",
        json={"username": "gate-staff@example.com", "password": temp_pw},
    )
    assert login.status_code == 200, login.text
    assert login.json()["role"] == "staff"
    staff_token = login.json()["access_token"]

    staff = TestClient(app)
    staff.cookies.set("platform_access_token", staff_token)
    app.dependency_overrides[get_db] = _override

    print("3) Staff GET /me")
    staff_me = staff.get("/api/platform/me")
    assert staff_me.status_code == 200, staff_me.text
    staff_body = staff_me.json()
    print("   role=", staff_body.get("role"), "membership.role=", staff_body.get("membership", {}).get("role"))
    assert staff_body["role"] == "staff"
    assert staff_body["membership"]["role"] == "staff"
    assert staff_body["role"] != admin_body["role"]
    assert _frontend_is_org_admin(staff_body["role"]) is False

    print("4) Staff admin-only APIs -> 403")
    assert (
        staff.post(
            "/api/platform/document-types/",
            json={"name": "Nope", "slug": "nope-staff"},
        ).status_code
        == 403
    )
    assert (
        staff.post(
            "/api/platform/users/invite",
            json={"email": "x@example.com", "role": "staff"},
        ).status_code
        == 403
    )
    # Create a type as admin to probe patch/delete
    created = admin_client.post(
        "/api/platform/document-types/",
        json={"name": "Protected", "slug": "protected-type"},
    )
    assert created.status_code == 201, created.text
    dt_id = created.json()["id"]
    assert staff.patch(f"/api/platform/document-types/{dt_id}", json={"name": "Hijack"}).status_code == 403
    assert staff.delete(f"/api/platform/document-types/{dt_id}").status_code == 403
    assert staff.post("/api/platform/option-lists", json={"name": "N", "slug": "n"}).status_code == 403

    print("5) Frontend helper before/after contract")
    print("   BEFORE (bug class): missing UI gates meant staff saw admin buttons even when role=='staff'")
    print("   AFTER: isOrgAdmin(role) is True only for 'org_admin'; pages use context.isOrgAdmin")
    assert _frontend_is_org_admin("staff") is False
    assert _frontend_is_org_admin("org_admin") is True
    assert _frontend_is_org_admin(None) is False
    assert _frontend_is_org_admin("") is False

    print("PASS verify_staff_admin_role_gates")
    return 0


if __name__ == "__main__":
    try:
        code = main()
    finally:
        shutil.rmtree(_TEST_FILE_ROOT, ignore_errors=True)
        app.dependency_overrides.clear()
    raise SystemExit(code)

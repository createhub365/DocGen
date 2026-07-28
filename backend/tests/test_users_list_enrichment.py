"""Users list enrichment + staff can list (UI wiring support)."""
from __future__ import annotations

from fastapi.testclient import TestClient

from database import get_db
from main import app
from tests.conftest import _override_get_db_factory


def test_list_users_includes_username_email_and_staff_can_list(dual_org_clients):
    client_a = dual_org_clients["client_a"]

    invite = client_a.post(
        "/api/platform/users/invite",
        json={"email": "listed.staff@example.com", "role": "staff"},
    )
    assert invite.status_code == 201, invite.text
    temp_pw = invite.json()["temporary_password"]
    assert invite.json()["membership"]["username"] == "listed.staff@example.com"

    listed_admin = client_a.get("/api/platform/users")
    assert listed_admin.status_code == 200, listed_admin.text
    rows = listed_admin.json()
    match = next(r for r in rows if r["username"] == "listed.staff@example.com")
    assert match["email"] == "listed.staff@example.com"
    assert match["role"] == "staff"
    assert match["user_id"]

    app.dependency_overrides[get_db] = _override_get_db_factory()
    login_client = TestClient(app)
    login = login_client.post(
        "/api/platform/login",
        json={"username": "listed.staff@example.com", "password": temp_pw},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    # Prefer org JWT cookie style used elsewhere
    staff = TestClient(app)
    staff.cookies.set("platform_access_token", login.json()["access_token"])
    app.dependency_overrides[get_db] = _override_get_db_factory()

    listed_staff = staff.get("/api/platform/users")
    assert listed_staff.status_code == 200, listed_staff.text
    assert any(r["username"] == "listed.staff@example.com" for r in listed_staff.json())

    # Staff still cannot invite
    blocked = staff.post(
        "/api/platform/users/invite",
        json={"email": "nope@example.com", "role": "staff"},
    )
    assert blocked.status_code == 403
    staff.close()
    login_client.close()

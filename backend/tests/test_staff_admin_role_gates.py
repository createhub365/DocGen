"""Frontend role helper + /me role shape for staff vs admin."""
from __future__ import annotations

from fastapi.testclient import TestClient

from database import get_db
from main import app
from tests.conftest import _override_get_db_factory


def _is_org_admin(role):
    """Keep in sync with frontend/src/utils/platformRoles.js."""
    return role == "org_admin"


def test_me_role_differs_for_staff_vs_admin_and_helper(dual_org_clients):
    client_a = dual_org_clients["client_a"]

    admin_me = client_a.get("/api/platform/me")
    assert admin_me.status_code == 200
    admin_body = admin_me.json()
    assert "role" in admin_body
    assert admin_body["role"] == "org_admin"
    assert admin_body["membership"]["role"] == "org_admin"
    assert _is_org_admin(admin_body["role"]) is True

    invite = client_a.post(
        "/api/platform/users/invite",
        json={"email": "role.gate.staff@example.com", "role": "staff"},
    )
    assert invite.status_code == 201, invite.text
    temp_pw = invite.json()["temporary_password"]

    app.dependency_overrides[get_db] = _override_get_db_factory()
    login_client = TestClient(app)
    login = login_client.post(
        "/api/platform/login",
        json={"username": "role.gate.staff@example.com", "password": temp_pw},
    )
    assert login.status_code == 200, login.text
    assert login.json()["role"] == "staff"

    staff = TestClient(app)
    staff.cookies.set("platform_access_token", login.json()["access_token"])
    app.dependency_overrides[get_db] = _override_get_db_factory()

    staff_me = staff.get("/api/platform/me")
    assert staff_me.status_code == 200
    staff_body = staff_me.json()
    assert staff_body["role"] == "staff"
    assert staff_body["membership"]["role"] == "staff"
    assert staff_body["role"] != admin_body["role"]
    assert _is_org_admin(staff_body["role"]) is False

    # Backend still enforces admin-only mutations
    assert (
        staff.post(
            "/api/platform/document-types/",
            json={"name": "Blocked", "slug": "blocked-by-staff"},
        ).status_code
        == 403
    )

    staff.close()
    login_client.close()

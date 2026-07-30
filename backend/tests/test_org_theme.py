"""Org-level UI theme_key: PATCH, /me, org-scope, staff gate."""
from __future__ import annotations

from models import Organization
from tests.test_phase12_option_lists import _staff_client


def test_theme_default_null_in_me(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    me = client_a.get("/api/platform/me")
    assert me.status_code == 200, me.text
    org = me.json()["organization"]
    assert "theme_key" in org
    assert org["theme_key"] is None


def test_set_theme_persists_and_returned_in_me(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    patched = client_a.patch(
        "/api/platform/organization/theme",
        json={"theme_key": "navy"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["theme_key"] == "navy"

    me = client_a.get("/api/platform/me")
    assert me.status_code == 200
    assert me.json()["organization"]["theme_key"] == "navy"

    db.expire_all()
    org_id = me.json()["organization"]["id"]
    row = db.query(Organization).filter(Organization.id == org_id).first()
    assert row.theme_key == "navy"

    cleared = client_a.patch(
        "/api/platform/organization/theme",
        json={"theme_key": None},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["theme_key"] is None
    me2 = client_a.get("/api/platform/me")
    assert me2.json()["organization"]["theme_key"] is None


def test_theme_is_org_scoped(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]

    assert (
        client_a.patch(
            "/api/platform/organization/theme",
            json={"theme_key": "forest"},
        ).status_code
        == 200
    )
    me_a = client_a.get("/api/platform/me").json()["organization"]
    me_b = client_b.get("/api/platform/me").json()["organization"]
    assert me_a["theme_key"] == "forest"
    assert me_b["theme_key"] is None

    assert (
        client_b.patch(
            "/api/platform/organization/theme",
            json={"theme_key": "slate"},
        ).status_code
        == 200
    )
    me_a2 = client_a.get("/api/platform/me").json()["organization"]
    me_b2 = client_b.get("/api/platform/me").json()["organization"]
    assert me_a2["theme_key"] == "forest"
    assert me_b2["theme_key"] == "slate"


def test_staff_cannot_patch_theme(dual_org_clients):
    staff = _staff_client(dual_org_clients, email="staff.theme@example.com")
    resp = staff.patch(
        "/api/platform/organization/theme",
        json={"theme_key": "navy"},
    )
    assert resp.status_code == 403


def test_invalid_theme_key_rejected(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    resp = client_a.patch(
        "/api/platform/organization/theme",
        json={"theme_key": "neon-rainbow"},
    )
    assert resp.status_code == 422

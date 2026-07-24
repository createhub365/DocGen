"""Phase 5 — platform rate limiting + audit log."""
from __future__ import annotations

from unittest.mock import patch

from limiter import limiter
from models import AuditLog, OrgUser


def test_signup_exceeds_rate_limit_returns_429(client, monkeypatch):
    """POST /api/platform/signup returns 429 after threshold (not 500 / silent pass)."""
    monkeypatch.setenv("PLATFORM_SIGNUP_RATE_LIMIT", "3/hour")
    limiter.reset()

    for i in range(3):
        resp = client.post(
            "/api/platform/signup",
            json={
                "name": f"Rate Org {i}",
                "slug": f"rate-org-{i}",
                "username": f"rate_admin_{i}",
                "password": "secure-pass-123",
            },
        )
        assert resp.status_code == 201, resp.text

    blocked = client.post(
        "/api/platform/signup",
        json={
            "name": "Rate Org Over",
            "slug": "rate-org-over",
            "username": "rate_admin_over",
            "password": "secure-pass-123",
        },
    )
    assert blocked.status_code == 429, blocked.text
    assert blocked.status_code != 500


def test_flow_publish_creates_exactly_one_audit_row(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    org_a = dual_org_clients["org_a"]

    dt = client_a.post(
        "/api/platform/document-types/",
        json={"name": "Audit Flow", "slug": "audit-flow"},
    )
    assert dt.status_code == 201
    dt_id = dt.json()["id"]

    flow = client_a.post(
        f"/api/platform/{dt_id}/flow",
        json={"name": "Draft"},
    )
    assert flow.status_code == 201
    flow_id = flow.json()["id"]

    before = (
        db.query(AuditLog)
        .filter(
            AuditLog.org_id == org_a["org"].id,
            AuditLog.action == "flow.published",
        )
        .count()
    )
    assert before == 0

    pub = client_a.post(f"/api/platform/{flow_id}/publish")
    assert pub.status_code == 200, pub.text

    db.expire_all()
    rows = (
        db.query(AuditLog)
        .filter(
            AuditLog.org_id == org_a["org"].id,
            AuditLog.action == "flow.published",
        )
        .all()
    )
    assert len(rows) == 1
    row = rows[0]
    assert row.actor_user_id == org_a["user"].id
    assert row.target_type == "FlowConfig"
    assert row.target_id == str(flow_id)


def test_role_change_audit_contains_old_and_new_role(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    org_a = dual_org_clients["org_a"]

    invite = client_a.post(
        "/api/platform/users/invite",
        json={"email": "role.change@example.com", "role": "staff"},
    )
    assert invite.status_code == 201, invite.text
    membership_id = invite.json()["membership"]["id"]

    patch_resp = client_a.patch(
        f"/api/platform/users/{membership_id}/role",
        json={"role": "org_admin"},
    )
    assert patch_resp.status_code == 200, patch_resp.text

    db.expire_all()
    rows = (
        db.query(AuditLog)
        .filter(
            AuditLog.org_id == org_a["org"].id,
            AuditLog.action == "user.role_changed",
            AuditLog.target_id == str(membership_id),
        )
        .all()
    )
    assert len(rows) == 1
    meta = rows[0].metadata_json or {}
    assert meta.get("old_role") == "staff"
    assert meta.get("new_role") == "org_admin"


def test_cross_org_cannot_see_other_org_audit_log(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    db = dual_org_clients["db"]
    org_a = dual_org_clients["org_a"]
    org_b = dual_org_clients["org_b"]

    # Multiple logged actions in org A
    for i in range(3):
        dt = client_a.post(
            "/api/platform/document-types/",
            json={"name": f"A Type {i}", "slug": f"a-type-{i}"},
        )
        assert dt.status_code == 201
        flow = client_a.post(
            f"/api/platform/{dt.json()['id']}/flow",
            json={"name": "F"},
        )
        assert flow.status_code == 201
        assert (
            client_a.post(f"/api/platform/{flow.json()['id']}/publish").status_code
            == 200
        )

    # One action in org B so B's log is non-empty
    dt_b = client_b.post(
        "/api/platform/document-types/",
        json={"name": "B Type", "slug": "b-type"},
    )
    assert dt_b.status_code == 201

    db.expire_all()
    a_count = db.query(AuditLog).filter(AuditLog.org_id == org_a["org"].id).count()
    b_count = db.query(AuditLog).filter(AuditLog.org_id == org_b["org"].id).count()
    assert a_count >= 6  # create + publish × 3
    assert b_count >= 1

    listed = client_b.get("/api/platform/audit-log?limit=100&offset=0")
    assert listed.status_code == 200, listed.text
    payload = listed.json()
    assert payload["total"] == b_count
    org_ids = {item["org_id"] for item in payload["items"]}
    assert org_ids == {org_b["org"].id}
    assert org_a["org"].id not in org_ids
    for item in payload["items"]:
        assert item["org_id"] != org_a["org"].id


def test_audit_log_failure_does_not_block_publish(dual_org_clients):
    """log_audit_event soft-dependency: parent action still succeeds if audit fails."""
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    org_a = dual_org_clients["org_a"]

    dt = client_a.post(
        "/api/platform/document-types/",
        json={"name": "Soft Dep", "slug": "soft-dep"},
    )
    assert dt.status_code == 201
    flow = client_a.post(
        f"/api/platform/{dt.json()['id']}/flow",
        json={"name": "Draft"},
    )
    assert flow.status_code == 201
    flow_id = flow.json()["id"]

    with patch(
        "routers.platform_scope.models.AuditLog",
        side_effect=RuntimeError("simulated audit failure"),
    ):
        pub = client_a.post(f"/api/platform/{flow_id}/publish")
    assert pub.status_code == 200, pub.text
    assert pub.json()["is_published"] is True

    db.expire_all()
    # Business row published; no successful audit row for this failure path
    from models import FlowConfig

    flow_row = db.query(FlowConfig).filter(FlowConfig.id == flow_id).one()
    assert flow_row.is_published is True
    assert (
        db.query(AuditLog)
        .filter(
            AuditLog.org_id == org_a["org"].id,
            AuditLog.action == "flow.published",
            AuditLog.target_id == str(flow_id),
        )
        .count()
        == 0
    )


def test_audit_log_requires_org_admin(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    invite = client_a.post(
        "/api/platform/users/invite",
        json={"email": "staff.audit@example.com", "role": "staff"},
    )
    assert invite.status_code == 201
    membership = (
        db.query(OrgUser)
        .filter(OrgUser.id == invite.json()["membership"]["id"])
        .one()
    )

    from auth import create_org_jwt
    from fastapi.testclient import TestClient
    from database import get_db
    from main import app
    from tests.conftest import _override_get_db_factory

    staff_token = create_org_jwt(
        user_id=membership.user_id,
        org_id=membership.org_id,
        role="staff",
    )
    staff = TestClient(app)
    app.dependency_overrides[get_db] = _override_get_db_factory()
    staff.cookies.set("platform_access_token", staff_token)
    resp = staff.get("/api/platform/audit-log")
    assert resp.status_code == 403
    staff.close()

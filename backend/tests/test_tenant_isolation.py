"""Task 3 — prove tenant isolation (org_a must never see org_b data)."""
from __future__ import annotations

from datetime import timedelta

import pytest

from auth import create_org_jwt
from models import FlowStep, Organization, OrgUser, User


def test_cross_org_document_type_get_patch_delete_are_404(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]

    created = client_a.post(
        "/api/platform/document-types/",
        json={"name": "Offer Letter", "slug": "offer-letter", "description": "A"},
    )
    assert created.status_code == 201, created.text
    dt_id = created.json()["id"]

    assert client_b.get(f"/api/platform/document-types/{dt_id}").status_code == 404
    assert (
        client_b.patch(
            f"/api/platform/document-types/{dt_id}",
            json={"name": "Hacked"},
        ).status_code
        == 404
    )
    assert client_b.delete(f"/api/platform/document-types/{dt_id}").status_code == 404

    # Still exists for org_a
    assert client_a.get(f"/api/platform/document-types/{dt_id}").status_code == 200


def test_cross_org_published_flow_is_404(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]

    dt = client_a.post(
        "/api/platform/document-types/",
        json={"name": "Contract", "slug": "contract"},
    ).json()
    flow = client_a.post(f"/api/platform/{dt['id']}/flow", json={}).json()
    pub = client_a.post(f"/api/platform/{flow['id']}/publish")
    assert pub.status_code == 200, pub.text
    assert pub.json()["is_published"] is True

    # org_b must not learn that a published flow exists for org_a's type
    resp = client_b.get(f"/api/platform/{dt['id']}/flow/published")
    assert resp.status_code == 404


def test_list_document_types_never_includes_other_org(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]

    # Same display name in both orgs
    a = client_a.post(
        "/api/platform/document-types/",
        json={"name": "Shared Name", "slug": "shared-a"},
    )
    b = client_b.post(
        "/api/platform/document-types/",
        json={"name": "Shared Name", "slug": "shared-b"},
    )
    assert a.status_code == 201
    assert b.status_code == 201
    a_id = a.json()["id"]
    b_id = b.json()["id"]

    list_a = client_a.get("/api/platform/document-types/").json()
    list_b = client_b.get("/api/platform/document-types/").json()

    ids_a = {row["id"] for row in list_a}
    ids_b = {row["id"] for row in list_b}

    assert a_id in ids_a
    assert b_id not in ids_a
    assert b_id in ids_b
    assert a_id not in ids_b
    assert all(row["org_id"] == dual_org_clients["org_a"]["org"].id for row in list_a)
    assert all(row["org_id"] == dual_org_clients["org_b"]["org"].id for row in list_b)


def test_signup_duplicate_slug_returns_409_no_partial_row(client, db):
    first = client.post(
        "/api/platform/signup",
        json={
            "name": "Acme Corp",
            "slug": "acme",
            "username": "acme_admin",
            "password": "secure-pass-1",
        },
    )
    assert first.status_code == 201, first.text

    before_orgs = db.query(Organization).count()
    before_users = db.query(User).count()
    before_members = db.query(OrgUser).count()

    conflict = client.post(
        "/api/platform/signup",
        json={
            "name": "Acme Other",
            "slug": "acme",
            "username": "acme_admin_2",
            "password": "secure-pass-2",
        },
    )
    assert conflict.status_code == 409

    db.expire_all()
    assert db.query(Organization).count() == before_orgs
    assert db.query(User).count() == before_users
    assert db.query(OrgUser).count() == before_members
    assert db.query(Organization).filter_by(slug="acme").count() == 1


def test_auth_rejects_missing_expired_and_deactivated_org(client, db, dual_org_clients):
    # No cookie
    assert client.get("/api/platform/me").status_code == 401
    assert client.get("/api/platform/document-types/").status_code == 401

    org = dual_org_clients["org_a"]["org"]
    user = dual_org_clients["org_a"]["user"]

    # Expired cookie
    expired = create_org_jwt(
        user_id=user.id,
        org_id=org.id,
        role="org_admin",
        expires_delta=timedelta(seconds=-30),
    )
    client.cookies.set("platform_access_token", expired)
    assert client.get("/api/platform/me").status_code == 401

    # Deactivated org
    live = create_org_jwt(user_id=user.id, org_id=org.id, role="org_admin")
    org_row = db.query(Organization).filter(Organization.id == org.id).first()
    org_row.is_active = False
    db.commit()

    client.cookies.set("platform_access_token", live)
    assert client.get("/api/platform/me").status_code == 401
    assert client.get("/api/platform/document-types/").status_code == 401


def test_cross_org_add_step_blocked(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    db = dual_org_clients["db"]

    dt = client_a.post(
        "/api/platform/document-types/",
        json={"name": "Step Guard", "slug": "step-guard"},
    )
    assert dt.status_code == 201, dt.text
    flow = client_a.post(f"/api/platform/{dt.json()['id']}/flow", json={})
    assert flow.status_code == 201, flow.text
    flow_config_id = flow.json()["id"]

    db.expire_all()
    steps_before = (
        db.query(FlowStep)
        .filter(FlowStep.flow_config_id == flow_config_id)
        .count()
    )

    resp = client_b.post(
        f"/api/platform/{flow_config_id}/steps",
        json={
            "step_type": "text_field",
            "order_index": 0,
            "label": "Hacked Step",
            "is_enabled": True,
        },
    )
    assert resp.status_code == 404
    assert resp.status_code != 403
    assert resp.status_code != 200

    db.expire_all()
    steps_after = (
        db.query(FlowStep)
        .filter(FlowStep.flow_config_id == flow_config_id)
        .count()
    )
    assert steps_after == steps_before
    assert (
        db.query(FlowStep).filter(FlowStep.label == "Hacked Step").count() == 0
    )


def test_cross_org_patch_step_blocked(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    db = dual_org_clients["db"]

    dt = client_a.post(
        "/api/platform/document-types/",
        json={"name": "Patch Guard", "slug": "patch-guard"},
    )
    assert dt.status_code == 201, dt.text
    flow = client_a.post(f"/api/platform/{dt.json()['id']}/flow", json={})
    assert flow.status_code == 201, flow.text
    flow_config_id = flow.json()["id"]

    step_resp = client_a.post(
        f"/api/platform/{flow_config_id}/steps",
        json={
            "step_type": "text_field",
            "order_index": 0,
            "label": "Original Label",
            "is_enabled": True,
        },
    )
    assert step_resp.status_code == 201, step_resp.text
    step_id = step_resp.json()["id"]
    original_label = step_resp.json()["label"]
    original_enabled = step_resp.json()["is_enabled"]

    resp = client_b.patch(
        f"/api/platform/steps/{step_id}",
        json={"label": "Hacked Label", "is_enabled": False},
    )
    assert resp.status_code == 404

    db.expire_all()
    row = db.query(FlowStep).filter(FlowStep.id == step_id).first()
    assert row is not None
    assert row.label == original_label
    assert row.is_enabled == original_enabled
    assert row.label != "Hacked Label"

"""Phase 4 — org user management + flow republish lifecycle."""
from __future__ import annotations

from fastapi.testclient import TestClient

from auth import create_org_jwt, hash_password
from database import get_db
from main import app
from models import FlowStep, OrgUser, User
from tests.conftest import _override_get_db_factory


def test_platform_login_rejects_legacy_user_without_org_membership(client, db):
    """Pure legacy staff (no OrgUser) must not get a platform org JWT."""
    user = User(
        username="legacy_only@example.com",
        full_name="Legacy Only",
        password_hash=hash_password("legacy-pass-99"),
        role="staff",
        is_active=True,
    )
    db.add(user)
    db.commit()

    assert db.query(OrgUser).filter(OrgUser.user_id == user.id).count() == 0

    resp = client.post(
        "/api/platform/login",
        json={"username": "legacy_only@example.com", "password": "legacy-pass-99"},
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "User is not a member of any organization"


def test_invite_staff_can_login_and_is_org_scoped(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    admin_token = dual_org_clients["org_a"]["token"]

    invite = client_a.post(
        "/api/platform/users/invite",
        json={"email": "staff.a@example.com", "role": "staff"},
    )
    assert invite.status_code == 201, invite.text
    temp_pw = invite.json()["temporary_password"]
    assert temp_pw
    assert invite.json()["membership"]["role"] == "staff"

    # Use a dedicated client for login so admin cookie on client_a is preserved
    login_client = TestClient(app)
    app.dependency_overrides[get_db] = _override_get_db_factory()
    login = login_client.post(
        "/api/platform/login",
        json={"username": "staff.a@example.com", "password": temp_pw},
    )
    assert login.status_code == 200, login.text
    assert login.json()["role"] == "staff"
    assert login.json()["organization"]["id"] == dual_org_clients["org_a"]["org"].id

    staff = TestClient(app)
    staff.cookies.set("platform_access_token", login.json()["access_token"])

    me = staff.get("/api/platform/me")
    assert me.status_code == 200
    assert me.json()["organization"]["id"] == dual_org_clients["org_a"]["org"].id

    client_a.cookies.set("platform_access_token", admin_token)
    dt_b = client_b.post(
        "/api/platform/document-types/",
        json={"name": "B Only", "slug": "b-only"},
    )
    assert dt_b.status_code == 201
    assert staff.get(f"/api/platform/document-types/{dt_b.json()['id']}").status_code == 404

    staff.close()
    login_client.close()


def test_invite_conflict_when_user_already_in_org(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    db = dual_org_clients["db"]

    first = client_a.post(
        "/api/platform/users/invite",
        json={"email": "taken@example.com", "role": "staff"},
    )
    assert first.status_code == 201

    db.expire_all()
    before = db.query(OrgUser).count()

    # Same org again
    again = client_a.post(
        "/api/platform/users/invite",
        json={"email": "taken@example.com", "role": "staff"},
    )
    assert again.status_code == 409

    # Other org
    other = client_b.post(
        "/api/platform/users/invite",
        json={"email": "taken@example.com", "role": "staff"},
    )
    assert other.status_code == 409

    db.expire_all()
    assert db.query(OrgUser).count() == before


def test_last_admin_cannot_demote_or_delete_self(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    admin_membership_id = dual_org_clients["org_a"]["membership"].id

    db.expire_all()
    before_role = (
        db.query(OrgUser).filter(OrgUser.id == admin_membership_id).one().role
    )
    before_count = db.query(OrgUser).filter(
        OrgUser.org_id == dual_org_clients["org_a"]["org"].id
    ).count()

    demote = client_a.patch(
        f"/api/platform/users/{admin_membership_id}/role",
        json={"role": "staff"},
    )
    assert demote.status_code == 400

    delete = client_a.delete(f"/api/platform/users/{admin_membership_id}")
    assert delete.status_code == 400

    db.expire_all()
    row = db.query(OrgUser).filter(OrgUser.id == admin_membership_id).one()
    assert row.role == before_role == "org_admin"
    assert (
        db.query(OrgUser)
        .filter(OrgUser.org_id == dual_org_clients["org_a"]["org"].id)
        .count()
        == before_count
    )


def test_cross_org_cannot_patch_or_delete_membership(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    db = dual_org_clients["db"]

    invited = client_a.post(
        "/api/platform/users/invite",
        json={"email": "keep@example.com", "role": "staff"},
    )
    assert invited.status_code == 201
    org_user_id = invited.json()["membership"]["id"]

    db.expire_all()
    before = db.query(OrgUser).filter(OrgUser.id == org_user_id).one()
    before_role = before.role

    assert (
        client_b.patch(
            f"/api/platform/users/{org_user_id}/role",
            json={"role": "org_admin"},
        ).status_code
        == 404
    )
    assert client_b.delete(f"/api/platform/users/{org_user_id}").status_code == 404

    db.expire_all()
    row = db.query(OrgUser).filter(OrgUser.id == org_user_id).one()
    assert row.role == before_role
    assert row.org_id == dual_org_clients["org_a"]["org"].id


def test_deleted_membership_jwt_gets_401(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    admin_token = dual_org_clients["org_a"]["token"]

    invited = client_a.post(
        "/api/platform/users/invite",
        json={"email": "gone@example.com", "role": "staff"},
    )
    assert invited.status_code == 201
    membership = invited.json()["membership"]
    temp_pw = invited.json()["temporary_password"]

    login = client_a.post(
        "/api/platform/login",
        json={"username": "gone@example.com", "password": temp_pw},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]

    staff = TestClient(app)
    staff.cookies.set("platform_access_token", token)
    app.dependency_overrides[get_db] = _override_get_db_factory()
    assert staff.get("/api/platform/me").status_code == 200

    # Separate admin client — login responses must not overwrite admin auth
    admin = TestClient(app)
    app.dependency_overrides[get_db] = _override_get_db_factory()
    admin.cookies.set("platform_access_token", admin_token)
    remove = admin.delete(f"/api/platform/users/{membership['id']}")
    assert remove.status_code == 204, remove.text
    admin.close()

    db.expire_all()
    assert (
        db.query(OrgUser).filter(OrgUser.id == membership["id"]).first() is None
    )

    denied = staff.get("/api/platform/me")
    assert denied.status_code == 401
    staff.close()


def test_new_draft_does_not_mutate_published_steps(dual_org_clients):
    client_a = dual_org_clients["client_a"]

    dt = client_a.post(
        "/api/platform/document-types/",
        json={"name": "Draft Flow", "slug": "draft-flow"},
    ).json()
    flow = client_a.post(f"/api/platform/{dt['id']}/flow", json={}).json()
    step = client_a.post(
        f"/api/platform/{flow['id']}/steps",
        json={
            "step_type": "text_field",
            "order_index": 0,
            "label": "Only Published Step",
            "is_enabled": True,
        },
    ).json()
    assert client_a.post(f"/api/platform/{flow['id']}/publish").status_code == 200

    published_before = client_a.get(f"/api/platform/{dt['id']}/flow/published").json()
    assert published_before["id"] == flow["id"]

    draft = client_a.post(f"/api/platform/{dt['id']}/flow/new-draft")
    assert draft.status_code == 201, draft.text
    draft_id = draft.json()["id"]
    assert draft.json()["is_published"] is False
    assert draft_id != flow["id"]

    add = client_a.post(
        f"/api/platform/{draft_id}/steps",
        json={
            "step_type": "number_field",
            "order_index": 1,
            "label": "Draft Only Step",
            "is_enabled": True,
        },
    )
    assert add.status_code == 201

    published_after = client_a.get(f"/api/platform/{dt['id']}/flow/published").json()
    assert published_after["id"] == flow["id"]
    assert published_after["is_published"] is True

    # Published still has exactly the original step
    pub_steps = (
        dual_org_clients["db"]
        .query(FlowStep)
        .filter(FlowStep.flow_config_id == flow["id"])
        .all()
    )
    dual_org_clients["db"].expire_all()
    pub_steps = (
        dual_org_clients["db"]
        .query(FlowStep)
        .filter(FlowStep.flow_config_id == flow["id"])
        .all()
    )
    assert len(pub_steps) == 1
    assert pub_steps[0].id == step["id"]
    assert pub_steps[0].label == "Only Published Step"

    draft_steps = (
        dual_org_clients["db"]
        .query(FlowStep)
        .filter(FlowStep.flow_config_id == draft_id)
        .all()
    )
    assert len(draft_steps) == 2


def test_republish_draft_and_history(dual_org_clients):
    client_a = dual_org_clients["client_a"]

    dt = client_a.post(
        "/api/platform/document-types/",
        json={"name": "Repub", "slug": "repub"},
    ).json()
    flow_v1 = client_a.post(f"/api/platform/{dt['id']}/flow", json={}).json()
    client_a.post(
        f"/api/platform/{flow_v1['id']}/steps",
        json={
            "step_type": "text_field",
            "order_index": 0,
            "label": "V1",
            "is_enabled": True,
        },
    )
    assert client_a.post(f"/api/platform/{flow_v1['id']}/publish").status_code == 200

    draft = client_a.post(f"/api/platform/{dt['id']}/flow/new-draft").json()
    client_a.post(
        f"/api/platform/{draft['id']}/steps",
        json={
            "step_type": "text_field",
            "order_index": 1,
            "label": "V2 Extra",
            "is_enabled": True,
        },
    )
    pub = client_a.post(f"/api/platform/{draft['id']}/publish")
    assert pub.status_code == 200
    assert pub.json()["id"] == draft["id"]
    assert pub.json()["is_published"] is True

    current = client_a.get(f"/api/platform/{dt['id']}/flow/published").json()
    assert current["id"] == draft["id"]

    history = client_a.get(f"/api/platform/{dt['id']}/flow/history")
    assert history.status_code == 200
    versions = history.json()
    assert len(versions) == 2
    by_id = {v["id"]: v for v in versions}
    assert by_id[flow_v1["id"]]["is_published"] is False
    assert by_id[draft["id"]]["is_published"] is True


def test_cross_org_flow_draft_and_history_blocked(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]

    dt = client_a.post(
        "/api/platform/document-types/",
        json={"name": "Secret Flow", "slug": "secret-flow"},
    ).json()
    flow = client_a.post(f"/api/platform/{dt['id']}/flow", json={}).json()
    client_a.post(f"/api/platform/{flow['id']}/publish")

    assert client_b.post(f"/api/platform/{dt['id']}/flow/new-draft").status_code == 404
    assert client_b.get(f"/api/platform/{dt['id']}/flow/history").status_code == 404

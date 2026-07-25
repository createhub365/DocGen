"""Phase 12 — org-managed option lists."""
from __future__ import annotations

from fastapi.testclient import TestClient

from database import get_db
from main import app
from models import OrgOptionList
from tests.conftest import _override_get_db_factory
from tests.test_phase3_platform import _setup_published_flow_with_field


def _staff_client(dual_org_clients, *, email: str = "staff.lists@example.com"):
    client_a = dual_org_clients["client_a"]
    invite = client_a.post(
        "/api/platform/users/invite",
        json={"email": email, "role": "staff"},
    )
    assert invite.status_code == 201, invite.text
    temp_pw = invite.json()["temporary_password"]

    app.dependency_overrides[get_db] = _override_get_db_factory()
    login_client = TestClient(app)
    login = login_client.post(
        "/api/platform/login",
        json={"username": email, "password": temp_pw},
    )
    assert login.status_code == 200, login.text
    staff = TestClient(app)
    staff.cookies.set("platform_access_token", login.json()["access_token"])
    login_client.close()
    return staff


def _create_list_with_items(client, *, name="Employment status", slug="employment-status"):
    created = client.post(
        "/api/platform/option-lists",
        json={"name": name, "slug": slug},
    )
    assert created.status_code == 201, created.text
    list_id = created.json()["id"]
    for i, (value, label) in enumerate(
        [("permanent", "Permanent"), ("fixed", "Fixed term")]
    ):
        item = client.post(
            f"/api/platform/option-lists/{list_id}/items",
            json={
                "value": value,
                "label": label,
                "sort_order": i,
                "is_active": True,
            },
        )
        assert item.status_code == 201, item.text
    return list_id


def test_staff_can_read_option_lists_but_not_mutate(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    list_id = _create_list_with_items(client_a)
    staff = _staff_client(dual_org_clients)

    listed = staff.get("/api/platform/option-lists")
    assert listed.status_code == 200, listed.text
    assert any(row["id"] == list_id for row in listed.json())

    detail = staff.get(f"/api/platform/option-lists/{list_id}")
    assert detail.status_code == 200, detail.text
    assert len(detail.json()["items"]) == 2

    assert (
        staff.post(
            "/api/platform/option-lists",
            json={"name": "Nope", "slug": "nope"},
        ).status_code
        == 403
    )
    assert (
        staff.patch(
            f"/api/platform/option-lists/{list_id}",
            json={"name": "Hacked"},
        ).status_code
        == 403
    )
    assert staff.delete(f"/api/platform/option-lists/{list_id}").status_code == 403
    assert (
        staff.post(
            f"/api/platform/option-lists/{list_id}/items",
            json={"value": "x", "label": "X"},
        ).status_code
        == 403
    )

    staff.close()


def test_option_lists_are_org_isolated(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    list_id = _create_list_with_items(client_a, slug="org-a-only")

    assert client_b.get(f"/api/platform/option-lists/{list_id}").status_code == 404
    assert (
        client_b.patch(
            f"/api/platform/option-lists/{list_id}",
            json={"name": "Stolen"},
        ).status_code
        == 404
    )
    assert client_b.delete(f"/api/platform/option-lists/{list_id}").status_code == 404

    listed_b = client_b.get("/api/platform/option-lists")
    assert listed_b.status_code == 200
    assert all(row["id"] != list_id for row in listed_b.json())


def test_delete_option_list_blocked_when_in_use(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    list_id = _create_list_with_items(client_a, slug="in-use-list")

    setup = _setup_published_flow_with_field(client_a, slug="opt-delete-guard")
    # Replace the text field with a dropdown bound to the list
    fields = client_a.get(f"/api/platform/steps/{setup['step_id']}/fields").json()
    field_id = fields[0]["id"]
    patched = client_a.patch(
        f"/api/platform/fields/{field_id}",
        json={
            "field_type": "dropdown",
            "option_list_id": list_id,
            "options_json": ["ignored-inline"],
        },
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["option_list_id"] == list_id

    blocked = client_a.delete(f"/api/platform/option-lists/{list_id}")
    assert blocked.status_code == 409, blocked.text
    detail = blocked.json()["detail"]
    assert "in use" in detail["message"].lower()
    assert setup["field_key"] in detail["field_keys"]

    db.expire_all()
    assert db.query(OrgOptionList).filter(OrgOptionList.id == list_id).count() == 1

    # Detach then delete succeeds
    cleared = client_a.patch(
        f"/api/platform/fields/{field_id}",
        json={"option_list_id": None},
    )
    assert cleared.status_code == 200
    deleted = client_a.delete(f"/api/platform/option-lists/{list_id}")
    assert deleted.status_code == 204, deleted.text
    db.expire_all()
    assert db.query(OrgOptionList).filter(OrgOptionList.id == list_id).count() == 0


def test_list_wins_over_inline_options_on_field_read(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    list_id = _create_list_with_items(client_a, slug="list-wins")
    setup = _setup_published_flow_with_field(client_a, slug="opt-list-wins")
    fields = client_a.get(f"/api/platform/steps/{setup['step_id']}/fields").json()
    field_id = fields[0]["id"]

    patched = client_a.patch(
        f"/api/platform/fields/{field_id}",
        json={
            "field_type": "dropdown",
            "options_json": ["inline-a", "inline-b"],
            "option_list_id": list_id,
        },
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["options_json"] == ["inline-a", "inline-b"]
    assert body["option_list_id"] == list_id
    assert body["effective_options"] == [
        {"value": "permanent", "label": "Permanent"},
        {"value": "fixed", "label": "Fixed term"},
    ]

    listed = client_a.get(f"/api/platform/steps/{setup['step_id']}/fields").json()
    row = next(f for f in listed if f["id"] == field_id)
    assert [o["value"] for o in row["effective_options"]] == ["permanent", "fixed"]


def test_inline_options_still_work_without_option_list(dual_org_clients):
    """Backward compat: flows without option_list_id keep inline options_json."""
    client_a = dual_org_clients["client_a"]
    setup = _setup_published_flow_with_field(client_a, slug="opt-inline-compat")
    fields = client_a.get(f"/api/platform/steps/{setup['step_id']}/fields").json()
    field_id = fields[0]["id"]

    patched = client_a.patch(
        f"/api/platform/fields/{field_id}",
        json={
            "field_type": "dropdown",
            "options_json": ["Alpha", "Beta"],
            "option_list_id": None,
        },
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["option_list_id"] is None
    assert body["options_json"] == ["Alpha", "Beta"]
    assert body["effective_options"] == ["Alpha", "Beta"]


def test_cannot_attach_foreign_org_option_list(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    list_a = _create_list_with_items(client_a, slug="foreign-attach")

    setup_b = _setup_published_flow_with_field(client_b, slug="opt-foreign")
    fields = client_b.get(f"/api/platform/steps/{setup_b['step_id']}/fields").json()
    field_id = fields[0]["id"]

    denied = client_b.patch(
        f"/api/platform/fields/{field_id}",
        json={"field_type": "dropdown", "option_list_id": list_a},
    )
    assert denied.status_code == 404, denied.text

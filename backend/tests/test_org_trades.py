"""Org Trade Bank — CRUD, isolation, seed-from-legacy, field-type non-interference."""
from __future__ import annotations

from fastapi.testclient import TestClient

from database import get_db
from main import app
from models import FieldDefinition, OrgTrade
from tests.conftest import _override_get_db_factory
from tests.test_phase3_platform import _setup_published_flow_with_field


def _staff_client(dual_org_clients, *, email: str = "staff.trades@example.com"):
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


def test_trade_crud_and_staff_read_only(dual_org_clients):
    client_a = dual_org_clients["client_a"]

    created = client_a.post(
        "/api/platform/trades",
        json={"name": "Welder", "duties_text": "Weld joints\nInspect work"},
    )
    assert created.status_code == 201, created.text
    trade_id = created.json()["id"]
    assert created.json()["name"] == "Welder"
    assert "Weld joints" in created.json()["duties_text"]

    listed = client_a.get("/api/platform/trades")
    assert listed.status_code == 200
    assert any(row["id"] == trade_id for row in listed.json())

    patched = client_a.patch(
        f"/api/platform/trades/{trade_id}",
        json={"duties_text": "Updated duties"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["duties_text"] == "Updated duties"

    staff = _staff_client(dual_org_clients)
    assert staff.get("/api/platform/trades").status_code == 200
    assert staff.get(f"/api/platform/trades/{trade_id}").status_code == 200
    assert (
        staff.post(
            "/api/platform/trades",
            json={"name": "Nope", "duties_text": ""},
        ).status_code
        == 403
    )
    assert (
        staff.patch(
            f"/api/platform/trades/{trade_id}",
            json={"name": "Hacked"},
        ).status_code
        == 403
    )
    assert staff.delete(f"/api/platform/trades/{trade_id}").status_code == 403
    assert staff.post("/api/platform/trades/seed-from-legacy").status_code == 403
    staff.close()

    deleted = client_a.delete(f"/api/platform/trades/{trade_id}")
    assert deleted.status_code == 200, deleted.text


def test_trades_are_org_isolated(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]

    created = client_a.post(
        "/api/platform/trades",
        json={"name": "Org A Only", "duties_text": "A duties"},
    )
    assert created.status_code == 201, created.text
    trade_id = created.json()["id"]

    assert client_b.get("/api/platform/trades").json() == []
    assert client_b.get(f"/api/platform/trades/{trade_id}").status_code == 404
    assert (
        client_b.patch(
            f"/api/platform/trades/{trade_id}",
            json={"name": "Stolen"},
        ).status_code
        == 404
    )
    assert client_b.delete(f"/api/platform/trades/{trade_id}").status_code == 404


def test_seed_from_legacy_idempotent_no_legacy_fk(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    first = client_a.post("/api/platform/trades/seed-from-legacy")
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["created"] > 0
    assert body["total_legacy"] == body["created"] + body["skipped"]
    assert body["created"] == body["total_legacy"]

    listed = client_a.get("/api/platform/trades").json()
    assert len(listed) == body["created"]
    sample = listed[0]
    assert "name" in sample and "duties_text" in sample
    row = db.query(OrgTrade).filter(OrgTrade.id == sample["id"]).first()
    assert row is not None
    assert not hasattr(row, "legacy_trade_id")
    assert not hasattr(row, "anzsco_code")

    second = client_a.post("/api/platform/trades/seed-from-legacy")
    assert second.status_code == 200, second.text
    assert second.json()["created"] == 0
    assert second.json()["skipped"] == body["created"]
    assert len(client_a.get("/api/platform/trades").json()) == body["created"]


def test_trade_linked_field_does_not_break_other_field_types(dual_org_clients):
    """Regression: marking trade-linked duties must not alter other field types."""
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    setup = _setup_published_flow_with_field(client_a, slug="trade-link-reg")
    step_id = setup["step_id"]

    # Existing text field remains a normal field
    text_field = client_a.post(
        f"/api/platform/steps/{step_id}/fields",
        json={
            "field_key": "plain_notes",
            "field_label": "Notes",
            "field_type": "text",
            "is_required": False,
            "is_auto_generated": False,
            "auto_config_json": None,
        },
    )
    assert text_field.status_code == 201, text_field.text

    trade_field = client_a.post(
        f"/api/platform/steps/{step_id}/fields",
        json={
            "field_key": "job_duties",
            "field_label": "Job duties",
            "field_type": "text",
            "is_required": True,
            "is_auto_generated": False,
            "auto_config_json": {"kind": "trade_linked_duties"},
        },
    )
    assert trade_field.status_code == 201, trade_field.text

    number_field = client_a.post(
        f"/api/platform/steps/{step_id}/fields",
        json={
            "field_key": "years_exp",
            "field_label": "Years",
            "field_type": "number",
            "is_required": False,
            "is_auto_generated": False,
            "auto_config_json": None,
        },
    )
    assert number_field.status_code == 201, number_field.text

    db.expire_all()
    rows = {
        f.field_key: f
        for f in db.query(FieldDefinition)
        .filter(FieldDefinition.flow_step_id == step_id)
        .all()
    }
    assert rows["plain_notes"].auto_config_json is None
    assert rows["plain_notes"].field_type == "text"
    assert rows["years_exp"].field_type == "number"
    assert rows["years_exp"].auto_config_json is None
    assert rows["job_duties"].auto_config_json == {"kind": "trade_linked_duties"}
    assert rows["job_duties"].is_auto_generated is False
    assert rows["job_duties"].field_type == "text"

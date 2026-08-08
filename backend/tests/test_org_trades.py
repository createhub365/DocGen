"""Org Trade Bank — industries, synonyms, seed hierarchy, isolation."""
from __future__ import annotations

from fastapi.testclient import TestClient

from database import get_db
from main import app
from models import FieldDefinition, OrgTrade, OrgTradeIndustry
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
        json={
            "name": "Welder",
            "duties_text": "Weld joints\nInspect work",
            "synonyms": ["Fabricator", "Pipe welder"],
        },
    )
    assert created.status_code == 201, created.text
    trade_id = created.json()["id"]
    assert created.json()["name"] == "Welder"
    assert "Weld joints" in created.json()["duties_text"]
    assert created.json()["synonyms"] == ["Fabricator", "Pipe welder"]

    listed = client_a.get("/api/platform/trades")
    assert listed.status_code == 200
    assert any(row["id"] == trade_id for row in listed.json())

    patched = client_a.patch(
        f"/api/platform/trades/{trade_id}",
        json={"duties_text": "Updated duties", "synonyms": ["Welder tech"]},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["duties_text"] == "Updated duties"
    assert patched.json()["synonyms"] == ["Welder tech"]

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
    assert staff.post(
        "/api/platform/trade-industries", json={"name": "Nope"}
    ).status_code == 403
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


def test_industry_crud_isolation_and_set_null_on_delete(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    db = dual_org_clients["db"]

    ind = client_a.post(
        "/api/platform/trade-industries", json={"name": "Construction"}
    )
    assert ind.status_code == 201, ind.text
    industry_id = ind.json()["id"]

    assert client_b.get("/api/platform/trade-industries").json() == []
    assert (
        client_b.patch(
            f"/api/platform/trade-industries/{industry_id}",
            json={"name": "Stolen"},
        ).status_code
        == 404
    )
    assert (
        client_b.delete(f"/api/platform/trade-industries/{industry_id}").status_code
        == 404
    )

    trade = client_a.post(
        "/api/platform/trades",
        json={
            "name": "Builder",
            "duties_text": "Build",
            "industry_id": industry_id,
            "synonyms": ["Carpenter"],
        },
    )
    assert trade.status_code == 201, trade.text
    trade_id = trade.json()["id"]
    assert trade.json()["industry_id"] == industry_id
    assert trade.json()["industry_name"] == "Construction"

    renamed = client_a.patch(
        f"/api/platform/trade-industries/{industry_id}",
        json={"name": "Building & Construction"},
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["name"] == "Building & Construction"

    deleted_ind = client_a.delete(f"/api/platform/trade-industries/{industry_id}")
    assert deleted_ind.status_code == 200, deleted_ind.text

    db.expire_all()
    row = db.query(OrgTrade).filter(OrgTrade.id == trade_id).first()
    assert row is not None
    assert row.industry_id is None
    assert db.query(OrgTradeIndustry).filter(
        OrgTradeIndustry.id == industry_id
    ).first() is None

    detail = client_a.get(f"/api/platform/trades/{trade_id}")
    assert detail.status_code == 200
    assert detail.json()["industry_id"] is None
    assert detail.json()["synonyms"] == ["Carpenter"]


def test_seed_from_legacy_industries_nested_idempotent(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    first = client_a.post("/api/platform/trades/seed-from-legacy")
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["created"] > 0
    assert body["total_legacy"] == body["created"] + body["skipped"]
    assert body["created"] == body["total_legacy"]
    # Full legacy bank coverage (builtin is 13 industries / 432 trades)
    assert body["total_legacy"] >= 400
    assert body["industries_created"] >= 10
    assert body["industries_created"] + body["industries_skipped"] >= 10

    industries = client_a.get("/api/platform/trade-industries").json()
    assert len(industries) == body["industries_created"]

    listed = client_a.get("/api/platform/trades").json()
    assert len(listed) == body["created"]
    with_industry = [t for t in listed if t.get("industry_id") is not None]
    assert len(with_industry) == len(listed)
    assert all(t.get("industry_name") for t in listed)
    assert all(t.get("synonyms") == [] for t in listed[:20])

    sample = listed[0]
    row = db.query(OrgTrade).filter(OrgTrade.id == sample["id"]).first()
    assert row is not None
    assert row.industry_id is not None
    assert not hasattr(row, "legacy_trade_id")
    assert not hasattr(row, "anzsco_code")

    second = client_a.post("/api/platform/trades/seed-from-legacy")
    assert second.status_code == 200, second.text
    assert second.json()["created"] == 0
    assert second.json()["skipped"] == body["created"]
    assert second.json()["industries_created"] == 0
    assert len(client_a.get("/api/platform/trades").json()) == body["created"]
    assert len(client_a.get("/api/platform/trade-industries").json()) == body[
        "industries_created"
    ]


def test_synonym_roundtrip_on_trade(dual_org_clients):
    """Synonyms persist and are returned for Generate-side name/synonym search."""
    client_a = dual_org_clients["client_a"]

    created = client_a.post(
        "/api/platform/trades",
        json={
            "name": "Electrician",
            "duties_text": "Wire",
            "synonyms": ["Sparky", "Electrical fitter", "Sparky"],
        },
    )
    assert created.status_code == 201, created.text
    # Dedupe case-insensitive / exact
    assert created.json()["synonyms"] == ["Sparky", "Electrical fitter"]

    listed = client_a.get("/api/platform/trades").json()
    match = next(t for t in listed if t["name"] == "Electrician")
    blob = " ".join([match["name"], *match["synonyms"]]).lower()
    assert "sparky" in blob
    assert "electrical fitter" in blob


def test_trade_linked_field_does_not_break_other_field_types(dual_org_clients):
    """Regression: marking trade-linked duties must not alter other field types."""
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    setup = _setup_published_flow_with_field(client_a, slug="trade-link-reg")
    step_id = setup["step_id"]

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
            "auto_config_json": {"kind": "trade_linked_position", "duties_field_key": "duties_block"},
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
    assert rows["job_duties"].auto_config_json == {
        "kind": "trade_linked_position",
        "duties_field_key": "duties_block",
    }
    assert rows["job_duties"].is_auto_generated is False
    assert rows["job_duties"].field_type == "text"

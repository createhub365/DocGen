"""Org Trade Bank — existence check + AI generate-new (Groq mocked)."""
from __future__ import annotations

from fastapi.testclient import TestClient

from database import get_db
from main import app
from models import OrgTrade
from tests.conftest import _override_get_db_factory


def _staff_client(dual_org_clients, *, email: str = "staff.check@example.com"):
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


def _make_industry(client, name: str = "Construction"):
    created = client.post("/api/platform/trade-industries", json={"name": name})
    assert created.status_code == 201, created.text
    return created.json()


def test_check_exact_fuzzy_and_empty(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    industry = _make_industry(client_a, "Construction")
    ind_id = industry["id"]

    welder = client_a.post(
        "/api/platform/trades",
        json={
            "name": "Welder",
            "duties_text": "Weld metal",
            "industry_id": ind_id,
            "synonyms": ["Fabricator", "Pipe welder"],
        },
    )
    assert welder.status_code == 201, welder.text

    # Exact (case-insensitive)
    exact = client_a.get(
        "/api/platform/trades/check",
        params={"industry_id": ind_id, "name": "welder"},
    )
    assert exact.status_code == 200, exact.text
    body = exact.json()
    assert body["exact_match"] is not None
    assert body["exact_match"]["name"] == "Welder"
    assert body["exact_match"]["industry_id"] == ind_id

    # Fuzzy via synonym containment
    fuzzy = client_a.get(
        "/api/platform/trades/check",
        params={"industry_id": ind_id, "name": "Pipe weld"},
    )
    assert fuzzy.status_code == 200, fuzzy.text
    fbody = fuzzy.json()
    assert fbody["exact_match"] is None
    assert len(fbody["similar_matches"]) >= 1
    assert fbody["similar_matches"][0]["trade"]["name"] == "Welder"
    assert fbody["similar_matches"][0]["matched_on"] in ("name", "synonym")

    # No match
    empty = client_a.get(
        "/api/platform/trades/check",
        params={"industry_id": ind_id, "name": "Astronaut"},
    )
    assert empty.status_code == 200, empty.text
    ebody = empty.json()
    assert ebody["exact_match"] is None
    assert ebody["similar_matches"] == []


def test_generate_new_draft_then_create(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    industry = _make_industry(client_a, "Construction")
    ind_id = industry["id"]

    def fake_generate(*, name, industry_name):
        assert name == "Site Carpenter"
        assert industry_name == "Construction"
        return {
            "duties_text": (
                "Carry out core Site Carpenter tasks as directed by work orders.\n"
                "Apply technical knowledge and practical skills for the role.\n"
                "Inspect own work for quality before sign-off.\n"
                "Use tools safely and report defects promptly."
            ),
            "synonyms": ["Carpenter", "Formwork carpenter", "Joiner"],
        }

    monkeypatch.setattr(
        "routers.org_trades.generate_full_trade_entry",
        fake_generate,
    )

    draft = client_a.post(
        "/api/platform/trades/generate-new",
        json={"industry_id": ind_id, "name": "Site Carpenter"},
    )
    assert draft.status_code == 200, draft.text
    body = draft.json()
    assert body["name"] == "Site Carpenter"
    assert body["industry_id"] == ind_id
    assert body["industry_name"] == "Construction"
    assert "Site Carpenter tasks" in body["duties_text"]
    assert "Carpenter" in body["synonyms"]

    # Draft is not persisted yet
    assert db.query(OrgTrade).filter(OrgTrade.name == "Site Carpenter").count() == 0

    created = client_a.post(
        "/api/platform/trades",
        json={
            "name": body["name"],
            "industry_id": body["industry_id"],
            "duties_text": body["duties_text"],
            "synonyms": body["synonyms"],
        },
    )
    assert created.status_code == 201, created.text
    row = created.json()
    assert row["industry_id"] == ind_id
    assert row["duties_text"] == body["duties_text"]
    assert row["synonyms"] == body["synonyms"]


def test_generate_new_missing_api_key(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]
    industry = _make_industry(client_a, "Healthcare")
    from services.trade_synonym_generator import GroqNotConfiguredError

    def boom(*, name, industry_name):
        raise GroqNotConfiguredError(
            "AI synonym generation is not configured (GROQ_API_KEY)."
        )

    monkeypatch.setattr("routers.org_trades.generate_full_trade_entry", boom)
    result = client_a.post(
        "/api/platform/trades/generate-new",
        json={"industry_id": industry["id"], "name": "Nurse"},
    )
    assert result.status_code == 503
    assert "GROQ_API_KEY" in result.json()["detail"]


def test_check_and_generate_cross_org_isolation(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]

    ind_a = _make_industry(client_a, "Construction A")
    ind_b = _make_industry(client_b, "Construction B")

    created = client_a.post(
        "/api/platform/trades",
        json={
            "name": "Electrician",
            "duties_text": "Wire",
            "industry_id": ind_a["id"],
            "synonyms": [],
        },
    )
    assert created.status_code == 201

    # Org B cannot see Org A trade via check (wrong industry 404, or empty)
    other = client_b.get(
        "/api/platform/trades/check",
        params={"industry_id": ind_a["id"], "name": "Electrician"},
    )
    assert other.status_code == 404

    b_empty = client_b.get(
        "/api/platform/trades/check",
        params={"industry_id": ind_b["id"], "name": "Electrician"},
    )
    assert b_empty.status_code == 200
    assert b_empty.json()["exact_match"] is None

    staff = _staff_client(dual_org_clients)
    assert (
        staff.post(
            "/api/platform/trades/generate-new",
            json={"industry_id": ind_a["id"], "name": "Plumber"},
        ).status_code
        == 403
    )
    staff.close()

    called = {"n": 0}

    def fake_generate(*, name, industry_name):
        called["n"] += 1
        return {
            "duties_text": (
                "Carry out core Plumber tasks as directed.\n"
                "Apply practical skills for the Plumber role.\n"
                "Inspect work for quality before sign-off.\n"
                "Use tools safely."
            ),
            "synonyms": ["Pipe fitter", "Gasfitter", "Drainlayer"],
        }

    monkeypatch.setattr(
        "routers.org_trades.generate_full_trade_entry",
        fake_generate,
    )

    # Org B generate against Org A industry → 404
    assert (
        client_b.post(
            "/api/platform/trades/generate-new",
            json={"industry_id": ind_a["id"], "name": "Plumber"},
        ).status_code
        == 404
    )
    assert called["n"] == 0

    ok = client_a.post(
        "/api/platform/trades/generate-new",
        json={"industry_id": ind_a["id"], "name": "Plumber"},
    )
    assert ok.status_code == 200, ok.text
    assert called["n"] == 1

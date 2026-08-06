"""Org Trade Bank — industry suggest + batch generate (Groq mocked)."""
from __future__ import annotations

from fastapi.testclient import TestClient

from database import get_db
from main import app
from models import OrgTrade
from tests.conftest import _override_get_db_factory


def _make_industry(client, name: str = "Construction"):
    created = client.post("/api/platform/trade-industries", json={"name": name})
    assert created.status_code == 201, created.text
    return created.json()


def test_suggest_industry_trades_flags_existing(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]
    industry = _make_industry(client_a)
    ind_id = industry["id"]

    existing = client_a.post(
        "/api/platform/trades",
        json={
            "name": "Welder",
            "duties_text": "Weld",
            "industry_id": ind_id,
            "synonyms": [],
        },
    )
    assert existing.status_code == 201

    def fake_suggest(*, industry_name, count):
        assert industry_name == "Construction"
        assert count == 30
        return ["Welder", "Electrician", "Plumber", "Carpenter"]

    monkeypatch.setattr(
        "routers.org_trades.suggest_industry_trade_names",
        fake_suggest,
    )
    # Avoid real delay if somehow called
    monkeypatch.setattr("routers.org_trades.INTER_BATCH_DELAY_SEC", 0)

    result = client_a.post(
        "/api/platform/trades/suggest-industry-trades",
        json={"industry_id": ind_id, "count": 30},
    )
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["industry_id"] == ind_id
    assert "best-effort" in body["disclaimer"].lower() or "authoritative" in body[
        "disclaimer"
    ].lower()
    by_name = {s["name"]: s for s in body["suggestions"]}
    assert by_name["Welder"]["already_exists"] is True
    assert by_name["Welder"]["existing_trade_id"] == existing.json()["id"]
    assert by_name["Electrician"]["already_exists"] is False
    assert by_name["Plumber"]["already_exists"] is False


def test_generate_industry_batch_creates_chunked_partial_fail(
    dual_org_clients, monkeypatch
):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    industry = _make_industry(client_a, "Healthcare")
    ind_id = industry["id"]

    # Existing — must be skipped even if requested
    client_a.post(
        "/api/platform/trades",
        json={
            "name": "Nurse",
            "duties_text": "Care",
            "industry_id": ind_id,
            "synonyms": [],
        },
    )

    calls: list[str] = []

    def fake_generate(*, name, industry_name):
        calls.append(name)
        if name == "Bad Trade":
            raise ValueError("malformed duties")
        return {
            "duties_text": (
                f"Carry out core {name} tasks as directed.\n"
                f"Apply practical skills for the {name} role.\n"
                "Inspect work for quality before sign-off.\n"
                "Use tools safely."
            ),
            "synonyms": [f"Alt {name}", f"{name} assistant", f"{name} tech"],
        }

    monkeypatch.setattr(
        "routers.org_trades.generate_full_trade_entry",
        fake_generate,
    )
    monkeypatch.setattr("routers.org_trades.INTER_BATCH_DELAY_SEC", 0)

    names = ["Nurse", "Paramedic", "Bad Trade", "Radiographer", "Physio"]
    result = client_a.post(
        "/api/platform/trades/generate-industry-batch",
        json={
            "industry_id": ind_id,
            "trade_names": names,
            "max_trades": 2,
        },
    )
    assert result.status_code == 200, result.text
    body = result.json()
    # Nurse skipped (exists); first two new among remaining: Paramedic + Bad Trade
    # max_trades=2 means at most 2 create attempts from to_create list
    # to_create = Paramedic, Bad Trade, Radiographer, Physio → chunk of 2
    assert body["created"] == 1  # Paramedic ok, Bad Trade failed
    assert len(body["failed"]) == 1
    assert body["failed"][0]["name"] == "Bad Trade"
    assert set(body["remaining_names"]) == {"Radiographer", "Physio"}
    assert "Paramedic" in calls
    assert "Nurse" not in calls  # skipped before generate

    db.expire_all()
    row = (
        db.query(OrgTrade)
        .filter(OrgTrade.name == "Paramedic", OrgTrade.industry_id == ind_id)
        .first()
    )
    assert row is not None
    assert row.industry_id == ind_id
    assert "Paramedic tasks" in (row.duties_text or "")
    assert len(row.synonyms or []) >= 2

    # Continue remaining chunk
    result2 = client_a.post(
        "/api/platform/trades/generate-industry-batch",
        json={
            "industry_id": ind_id,
            "trade_names": body["remaining_names"],
            "max_trades": 10,
        },
    )
    assert result2.status_code == 200, result2.text
    body2 = result2.json()
    assert body2["created"] == 2
    assert body2["remaining_names"] == []


def test_generate_industry_batch_missing_key(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]
    industry = _make_industry(client_a, "Mining")
    from services.trade_synonym_generator import GroqNotConfiguredError

    def boom(*, name, industry_name):
        raise GroqNotConfiguredError(
            "AI synonym generation is not configured (GROQ_API_KEY)."
        )

    monkeypatch.setattr("routers.org_trades.generate_full_trade_entry", boom)
    monkeypatch.setattr("routers.org_trades.INTER_BATCH_DELAY_SEC", 0)
    result = client_a.post(
        "/api/platform/trades/generate-industry-batch",
        json={
            "industry_id": industry["id"],
            "trade_names": ["Miner"],
            "max_trades": 5,
        },
    )
    assert result.status_code == 503
    assert "GROQ_API_KEY" in result.json()["detail"]


def test_suggest_and_batch_cross_org(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    ind_a = _make_industry(client_a, "A Ind")
    ind_b = _make_industry(client_b, "B Ind")

    monkeypatch.setattr(
        "routers.org_trades.suggest_industry_trade_names",
        lambda **kwargs: ["Alpha", "Beta"],
    )
    monkeypatch.setattr("routers.org_trades.INTER_BATCH_DELAY_SEC", 0)

    assert (
        client_b.post(
            "/api/platform/trades/suggest-industry-trades",
            json={"industry_id": ind_a["id"], "count": 10},
        ).status_code
        == 404
    )
    ok = client_a.post(
        "/api/platform/trades/suggest-industry-trades",
        json={"industry_id": ind_a["id"], "count": 10},
    )
    assert ok.status_code == 200

    # Staff cannot suggest
    invite = client_a.post(
        "/api/platform/users/invite",
        json={"email": "staff.bulk@example.com", "role": "staff"},
    )
    assert invite.status_code == 201
    app.dependency_overrides[get_db] = _override_get_db_factory()
    login_client = TestClient(app)
    login = login_client.post(
        "/api/platform/login",
        json={
            "username": "staff.bulk@example.com",
            "password": invite.json()["temporary_password"],
        },
    )
    staff = TestClient(app)
    staff.cookies.set("platform_access_token", login.json()["access_token"])
    login_client.close()
    assert (
        staff.post(
            "/api/platform/trades/suggest-industry-trades",
            json={"industry_id": ind_a["id"], "count": 5},
        ).status_code
        == 403
    )
    staff.close()

    called = []

    def fake_gen(*, name, industry_name):
        called.append((name, industry_name))
        return {
            "duties_text": (
                "Carry out core tasks as directed.\n"
                "Apply practical skills for the role.\n"
                "Inspect work for quality before sign-off.\n"
                "Use tools safely."
            ),
            "synonyms": ["Alt1", "Alt2", "Alt3"],
        }

    monkeypatch.setattr("routers.org_trades.generate_full_trade_entry", fake_gen)
    assert (
        client_b.post(
            "/api/platform/trades/generate-industry-batch",
            json={
                "industry_id": ind_a["id"],
                "trade_names": ["X"],
                "max_trades": 5,
            },
        ).status_code
        == 404
    )
    assert called == []
    assert (
        client_a.post(
            "/api/platform/trades/generate-industry-batch",
            json={
                "industry_id": ind_b["id"],
                "trade_names": ["X"],
                "max_trades": 5,
            },
        ).status_code
        == 404
    )

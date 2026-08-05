"""Org Trade Bank — AI synonym generation (Groq mocked)."""
from __future__ import annotations

from fastapi.testclient import TestClient

from database import get_db
from main import app
from models import OrgTrade
from tests.conftest import _override_get_db_factory


def _staff_client(dual_org_clients, *, email: str = "staff.syn@example.com"):
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


def test_generate_synonyms_updates_empty_skips_existing(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    empty = client_a.post(
        "/api/platform/trades",
        json={"name": "Welder", "duties_text": "Weld metal", "synonyms": []},
    )
    assert empty.status_code == 201, empty.text
    empty_id = empty.json()["id"]

    filled = client_a.post(
        "/api/platform/trades",
        json={
            "name": "Electrician",
            "duties_text": "Wire",
            "synonyms": ["Sparky"],
        },
    )
    assert filled.status_code == 201, filled.text
    filled_id = filled.json()["id"]

    def fake_generate(trades, **kwargs):
        assert len(trades) == 1
        assert trades[0].id == empty_id
        return {empty_id: ["Fabricator", "Pipe welder"]}, []

    monkeypatch.setattr(
        "routers.org_trades.generate_synonyms_for_trades",
        fake_generate,
    )

    result = client_a.post("/api/platform/trades/generate-synonyms")
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["total_checked"] == 2
    assert body["updated"] == 1
    assert body["skipped_already_had"] == 1
    assert body["failed"] == []

    db.expire_all()
    welder = db.query(OrgTrade).filter(OrgTrade.id == empty_id).first()
    electrician = db.query(OrgTrade).filter(OrgTrade.id == filled_id).first()
    assert welder.synonyms == ["Fabricator", "Pipe welder"]
    assert electrician.synonyms == ["Sparky"]


def test_generate_synonyms_respects_max_trades(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]

    for name in ("Alpha Trade", "Beta Trade", "Gamma Trade"):
        created = client_a.post(
            "/api/platform/trades",
            json={"name": name, "duties_text": "Duties", "synonyms": []},
        )
        assert created.status_code == 201, created.text

    seen_ids: list[int] = []

    def fake_generate(trades, **kwargs):
        seen_ids.extend([t.id for t in trades])
        return ({t.id: [f"Alt {t.name}"] for t in trades}, [])

    monkeypatch.setattr(
        "routers.org_trades.generate_synonyms_for_trades",
        fake_generate,
    )

    result = client_a.post(
        "/api/platform/trades/generate-synonyms",
        json={"max_trades": 2},
    )
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["updated"] == 2
    assert body["total_checked"] == 3
    assert body["remaining_without_synonyms"] == 1
    assert len(seen_ids) == 2

    seen_ids.clear()
    result2 = client_a.post(
        "/api/platform/trades/generate-synonyms",
        json={"max_trades": 2},
    )
    assert result2.status_code == 200, result2.text
    body2 = result2.json()
    assert body2["updated"] == 1
    assert body2["remaining_without_synonyms"] == 0
    assert len(seen_ids) == 1


def test_generate_synonyms_malformed_batch_does_not_abort(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]

    a = client_a.post(
        "/api/platform/trades",
        json={"name": "Cook", "duties_text": "Cook food", "synonyms": []},
    )
    b = client_a.post(
        "/api/platform/trades",
        json={"name": "Baker", "duties_text": "Bake", "synonyms": []},
    )
    assert a.status_code == 201 and b.status_code == 201
    a_id, b_id = a.json()["id"], b.json()["id"]

    def fake_generate(trades, **kwargs):
        # One trade succeeds, one fails — run continues
        return (
            {a_id: ["Chef", "Kitchen hand"]},
            [{"trade_id": b_id, "name": "Baker", "reason": "malformed batch"}],
        )

    monkeypatch.setattr(
        "routers.org_trades.generate_synonyms_for_trades",
        fake_generate,
    )

    result = client_a.post("/api/platform/trades/generate-synonyms")
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["updated"] == 1
    assert len(body["failed"]) == 1
    assert body["failed"][0]["trade_id"] == b_id
    assert "malformed" in body["failed"][0]["reason"]


def test_generate_synonyms_missing_api_key_clear_error(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]
    client_a.post(
        "/api/platform/trades",
        json={"name": "Nurse", "duties_text": "Care", "synonyms": []},
    )

    from services.trade_synonym_generator import GroqNotConfiguredError

    def boom(*args, **kwargs):
        raise GroqNotConfiguredError(
            "AI synonym generation is not configured (GROQ_API_KEY)."
        )

    monkeypatch.setattr(
        "routers.org_trades.generate_synonyms_for_trades",
        boom,
    )

    result = client_a.post("/api/platform/trades/generate-synonyms")
    assert result.status_code == 503, result.text
    assert "not configured" in result.json()["detail"].lower()
    assert "GROQ_API_KEY" in result.json()["detail"]


def test_generate_synonyms_staff_forbidden_and_cross_org(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]

    created = client_a.post(
        "/api/platform/trades",
        json={"name": "OrgA Trade", "duties_text": "A", "synonyms": []},
    )
    assert created.status_code == 201
    a_id = created.json()["id"]
    a_org_id = created.json()["org_id"]

    seen_orgs: set[str] = set()

    def fake_generate(trades, **kwargs):
        for t in trades:
            seen_orgs.add(t.org_id)
        return ({t.id: ["Alt"] for t in trades}, [])

    monkeypatch.setattr(
        "routers.org_trades.generate_synonyms_for_trades",
        fake_generate,
    )

    staff = _staff_client(dual_org_clients)
    assert staff.post("/api/platform/trades/generate-synonyms").status_code == 403
    staff.close()

    # Org B has no trades → updated 0
    b_result = client_b.post("/api/platform/trades/generate-synonyms")
    assert b_result.status_code == 200, b_result.text
    assert b_result.json()["total_checked"] == 0
    assert b_result.json()["updated"] == 0

    a_result = client_a.post("/api/platform/trades/generate-synonyms")
    assert a_result.status_code == 200, a_result.text
    assert a_result.json()["updated"] == 1
    assert a_result.json()["total_checked"] == 1
    assert seen_orgs == {a_org_id}
    # Org A trade id never returned from Org B list
    assert all(t["id"] != a_id for t in client_b.get("/api/platform/trades").json())


def test_generate_synonyms_batch_parser_malformed_skips_batch(monkeypatch):
    """Unit: malformed Groq JSON fails the batch without raising out."""
    from services import trade_synonym_generator as gen

    monkeypatch.setenv("GROQ_API_KEY", "test-key")

    def boom_chat(*args, **kwargs):
        return "NOT JSON AT ALL {{{"

    monkeypatch.setattr(gen, "_chat_completions", boom_chat)
    monkeypatch.setattr(gen, "INTER_BATCH_DELAY_SEC", 0)

    class T:
        def __init__(self, id, name):
            self.id = id
            self.name = name
            self.duties_text = "x"

    updates, failed = gen.generate_synonyms_for_trades(
        [T(1, "Welder"), T(2, "Cook")],
        inter_batch_delay_sec=0,
    )
    assert updates == {}
    assert len(failed) == 2

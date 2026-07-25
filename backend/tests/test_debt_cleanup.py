"""Debt cleanup: is_complete, document_type_name, invite email, sentinel boolean."""
from __future__ import annotations

from fastapi.testclient import TestClient

from auth import create_access_token, hash_password
from database import get_db
from main import app
from models import Company, Country, DocumentType, Trade, User
from routers.platform_scope import (
    PLATFORM_LEGACY_COMPANY_NAME,
    PLATFORM_LEGACY_COUNTRY_CODE,
    PLATFORM_LEGACY_DOC_TYPE_SLUG,
    PLATFORM_LEGACY_TRADE_NAME,
)
from tests.conftest import _override_get_db_factory
from tests.test_phase3_platform import (
    _make_docx_bytes,
    _setup_published_flow_with_field,
)


def test_templates_list_includes_is_complete_mix(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    setup = _setup_published_flow_with_field(client_a, slug="debt-complete-mix")

    incomplete = client_a.post(
        f"/api/platform/{setup['dt_id']}/templates",
        files={
            "file": (
                "incomplete.docx",
                _make_docx_bytes("cand_name", "extra_ph"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert incomplete.status_code == 201, incomplete.text
    incomplete_id = incomplete.json()["id"]

    # Map only one of two placeholders → incomplete
    mapped = client_a.post(
        f"/api/platform/templates/{incomplete_id}/mappings",
        json={
            "mappings": [
                {"placeholder_key": "cand_name", "field_key": setup["field_key"]}
            ]
        },
    )
    assert mapped.status_code == 200
    assert mapped.json()["is_complete"] is False

    complete = client_a.post(
        f"/api/platform/{setup['dt_id']}/templates",
        files={
            "file": (
                "complete.docx",
                _make_docx_bytes("cand_name"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert complete.status_code == 201, complete.text
    complete_id = complete.json()["id"]
    mapped_ok = client_a.post(
        f"/api/platform/templates/{complete_id}/mappings",
        json={
            "mappings": [
                {"placeholder_key": "cand_name", "field_key": setup["field_key"]}
            ]
        },
    )
    assert mapped_ok.status_code == 200
    assert mapped_ok.json()["is_complete"] is True

    listed = client_a.get(f"/api/platform/{setup['dt_id']}/templates")
    assert listed.status_code == 200, listed.text
    by_id = {row["id"]: row for row in listed.json()}
    assert incomplete_id in by_id and complete_id in by_id
    assert by_id[incomplete_id]["is_complete"] is False
    assert by_id[complete_id]["is_complete"] is True


def test_generated_list_includes_document_type_name(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    setup_a = _setup_published_flow_with_field(client_a, slug="debt-dtype-a")
    setup_b = _setup_published_flow_with_field(
        client_a, slug="debt-dtype-b", field_key="cand_name"
    )

    def _upload_map_generate(setup, filename: str):
        up = client_a.post(
            f"/api/platform/{setup['dt_id']}/templates",
            files={
                "file": (
                    filename,
                    _make_docx_bytes("cand_name"),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
        )
        assert up.status_code == 201, up.text
        tmpl_id = up.json()["id"]
        mapped = client_a.post(
            f"/api/platform/templates/{tmpl_id}/mappings",
            json={
                "mappings": [
                    {"placeholder_key": "cand_name", "field_key": setup["field_key"]}
                ]
            },
        )
        assert mapped.status_code == 200
        gen = client_a.post(
            f"/api/platform/{setup['dt_id']}/generate",
            json={
                "template_id": tmpl_id,
                "fields": {setup["field_key"]: "Alex"},
            },
        )
        assert gen.status_code in (200, 201), gen.text
        return gen.json()["document_id"]

    id_a = _upload_map_generate(setup_a, "a.docx")
    id_b = _upload_map_generate(setup_b, "b.docx")

    listed = client_a.get("/api/platform/generated")
    assert listed.status_code == 200, listed.text
    by_id = {row["id"]: row for row in listed.json()}
    assert by_id[id_a]["document_type_name"] == "debt-dtype-a"
    assert by_id[id_b]["document_type_name"] == "debt-dtype-b"

    db.expire_all()
    from models import GeneratedDocument

    assert db.query(GeneratedDocument).filter(GeneratedDocument.id == id_a).count() == 1


def test_invite_stores_username_and_email(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    invite = client_a.post(
        "/api/platform/users/invite",
        json={"email": "invited.user@example.com", "role": "staff"},
    )
    assert invite.status_code == 201, invite.text
    body = invite.json()
    assert body["username"] == "invited.user@example.com"
    assert body["temporary_password"]

    db.expire_all()
    user = (
        db.query(User)
        .filter(User.username == "invited.user@example.com")
        .first()
    )
    assert user is not None
    assert user.email == "invited.user@example.com"
    assert user.username == "invited.user@example.com"


def test_invite_succeeds_when_email_send_fails(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]

    monkeypatch.setattr(
        "routers.org_users.send_invite_email",
        lambda **kwargs: False,
    )
    monkeypatch.setenv("SMTP_HOST", "smtp.example.invalid")
    monkeypatch.setenv("SMTP_FROM", "noreply@example.com")

    invite = client_a.post(
        "/api/platform/users/invite",
        json={"email": "softfail@example.com", "role": "staff"},
    )
    assert invite.status_code == 201, invite.text
    assert invite.json()["temporary_password"]
    assert invite.json()["username"] == "softfail@example.com"


def test_invite_email_helper_never_raises(monkeypatch):
    from services.invite_email import send_invite_email

    monkeypatch.setenv("SMTP_HOST", "smtp.example.invalid")
    monkeypatch.setenv("SMTP_FROM", "noreply@example.com")
    monkeypatch.setenv("SMTP_PORT", "587")

    class _BoomSMTP:
        def __init__(self, *args, **kwargs):
            raise OSError("network down")

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr("services.invite_email.smtplib.SMTP", _BoomSMTP)
    assert (
        send_invite_email(
            to_email="x@example.com",
            username="x@example.com",
            temporary_password="temp",
        )
        is False
    )


def test_boolean_sentinel_filter_keeps_user_text_with_pf_marker(dual_org_clients):
    """
    Prove string-marker fragility is fixed: a real legacy row whose code/name
    equals the old marker strings but is_platform_sentinel=False must remain
    visible; a row with is_platform_sentinel=True must be hidden even if its
    display name is normal.
    """
    db = dual_org_clients["db"]

    # User-entered text containing / equaling old markers, NOT flagged sentinel
    lookalike_country = Country(
        name="Island __PF__ Territory",
        code=PLATFORM_LEGACY_COUNTRY_CODE,  # would have been hidden by string match
        is_platform_sentinel=False,
    )
    db.add(lookalike_country)
    db.flush()

    lookalike_trade = Trade(
        name=PLATFORM_LEGACY_TRADE_NAME,
        country_id=lookalike_country.id,
        is_platform_sentinel=False,
    )
    db.add(lookalike_trade)
    db.flush()

    lookalike_company = Company(
        name=PLATFORM_LEGACY_COMPANY_NAME,
        trade_id=lookalike_trade.id,
        country_id=lookalike_country.id,
        is_platform_sentinel=False,
    )
    db.add(lookalike_company)

    lookalike_dtype = DocumentType(
        name="Contains __PF__ in title",
        slug=PLATFORM_LEGACY_DOC_TYPE_SLUG,
        is_platform_sentinel=False,
    )
    db.add(lookalike_dtype)

    # Actual sentinel with innocuous name/code (boolean is what matters)
    real_sentinel_country = Country(
        name="Hidden Sentinel Country",
        code="HSX",
        is_platform_sentinel=True,
    )
    db.add(real_sentinel_country)
    db.flush()
    real_sentinel_trade = Trade(
        name="Hidden Sentinel Trade",
        country_id=real_sentinel_country.id,
        is_platform_sentinel=True,
    )
    db.add(real_sentinel_trade)
    db.flush()
    real_sentinel_company = Company(
        name="Hidden Sentinel Co",
        trade_id=real_sentinel_trade.id,
        country_id=real_sentinel_country.id,
        is_platform_sentinel=True,
    )
    db.add(real_sentinel_company)
    real_sentinel_dtype = DocumentType(
        name="Hidden Sentinel Type",
        slug="hidden-sentinel-type",
        is_platform_sentinel=True,
    )
    db.add(real_sentinel_dtype)
    db.commit()

    legacy_user = User(
        username="legacy_sentinel_probe",
        full_name="Legacy Probe",
        password_hash=hash_password("pw"),
        role="staff",
        is_active=True,
    )
    db.add(legacy_user)
    db.commit()
    db.refresh(legacy_user)

    app.dependency_overrides[get_db] = _override_get_db_factory()
    legacy_client = TestClient(app)
    legacy_client.cookies.set(
        "access_token", create_access_token({"sub": legacy_user.username})
    )

    countries = legacy_client.get("/api/countries").json()
    codes = {c["code"] for c in countries}
    assert PLATFORM_LEGACY_COUNTRY_CODE in codes  # lookalike kept
    assert "HSX" not in codes  # boolean sentinel hidden

    trades = legacy_client.get(
        "/api/trades", params={"country_id": lookalike_country.id}
    ).json()
    trade_names = {t["name"] for t in trades}
    assert PLATFORM_LEGACY_TRADE_NAME in trade_names

    companies = legacy_client.get(
        "/api/companies",
        params={
            "trade_id": lookalike_trade.id,
            "country_id": lookalike_country.id,
        },
    ).json()
    company_names = {c["name"] for c in companies}
    assert PLATFORM_LEGACY_COMPANY_NAME in company_names

    hidden_companies = legacy_client.get(
        "/api/companies",
        params={
            "trade_id": real_sentinel_trade.id,
            "country_id": real_sentinel_country.id,
        },
    ).json()
    assert all(c["name"] != "Hidden Sentinel Co" for c in hidden_companies)

    doc_types = legacy_client.get("/api/document-types").json()
    slugs = {d["slug"] for d in doc_types}
    assert PLATFORM_LEGACY_DOC_TYPE_SLUG in slugs  # lookalike kept
    assert "hidden-sentinel-type" not in slugs

    legacy_client.close()

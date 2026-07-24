"""Sentinel-row leak + DOCGEN_SKIP_PDF safety checks."""
from __future__ import annotations

import io

import pytest
from docx import Document
from fastapi.testclient import TestClient

from auth import create_access_token, hash_password
from main import app
from models import Country, DocumentType, User
from routers.org_documents import _should_attempt_pdf_conversion
from routers.platform_scope import (
    PLATFORM_LEGACY_COUNTRY_CODE,
    PLATFORM_LEGACY_DOC_TYPE_SLUG,
)
from tests.conftest import _override_get_db_factory
from database import get_db


def _make_docx_bytes(*placeholder_ids: str) -> bytes:
    doc = Document()
    for pid in placeholder_ids:
        doc.add_paragraph(f"Hello {{{{{pid}}}}}")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_legacy_lists_exclude_platform_sentinels_after_org_upload(dual_org_clients):
    """After a platform template upload creates sentinel FKs, legacy lists omit them."""
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    # Seed one real legacy catalog row so the list isn't empty for other reasons
    real_country = Country(name="New Zealand", code="NZ")
    db.add(real_country)
    real_dtype = DocumentType(name="Offer Letter", slug="offer-letter")
    db.add(real_dtype)
    db.commit()

    dt = client_a.post(
        "/api/platform/document-types/",
        json={"name": "Sentinel Probe", "slug": "sentinel-probe"},
    )
    assert dt.status_code == 201, dt.text
    flow = client_a.post(f"/api/platform/{dt.json()['id']}/flow", json={})
    assert flow.status_code == 201
    client_a.post(f"/api/platform/{flow.json()['id']}/publish")

    up = client_a.post(
        f"/api/platform/{dt.json()['id']}/templates",
        files={
            "file": (
                "t.docx",
                _make_docx_bytes("cand_name"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert up.status_code == 201, up.text

    db.expire_all()
    assert (
        db.query(Country).filter(Country.code == PLATFORM_LEGACY_COUNTRY_CODE).count()
        == 1
    )
    assert (
        db.query(DocumentType)
        .filter(DocumentType.slug == PLATFORM_LEGACY_DOC_TYPE_SLUG)
        .count()
        == 1
    )

    # Legacy auth cookie (username JWT), not org JWT
    legacy_user = User(
        username="legacy_staff",
        full_name="Legacy Staff",
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
    assert "NZ" in codes
    assert PLATFORM_LEGACY_COUNTRY_CODE not in codes

    doc_types = legacy_client.get("/api/document-types").json()
    slugs = {d["slug"] for d in doc_types}
    assert "offer-letter" in slugs
    assert PLATFORM_LEGACY_DOC_TYPE_SLUG not in slugs

    legacy_client.close()


def test_should_attempt_pdf_default_matches_pre_phase3(monkeypatch):
    """Unset / false DOCGEN_SKIP_PDF ⇒ attempt PDF (pre-Phase-3 behavior)."""
    monkeypatch.delenv("DOCGEN_SKIP_PDF", raising=False)
    assert _should_attempt_pdf_conversion() is True

    monkeypatch.setenv("DOCGEN_SKIP_PDF", "")
    assert _should_attempt_pdf_conversion() is True

    monkeypatch.setenv("DOCGEN_SKIP_PDF", "false")
    assert _should_attempt_pdf_conversion() is True

    monkeypatch.setenv("DOCGEN_SKIP_PDF", "0")
    assert _should_attempt_pdf_conversion() is True


def test_should_attempt_pdf_skipped_only_when_explicitly_enabled(monkeypatch):
    for value in ("1", "true", "TRUE", "yes"):
        monkeypatch.setenv("DOCGEN_SKIP_PDF", value)
        assert _should_attempt_pdf_conversion() is False


def test_generate_calls_try_convert_when_skip_unset(dual_org_clients, monkeypatch):
    """When DOCGEN_SKIP_PDF is unset, generate must invoke try_convert_to_pdf."""
    monkeypatch.delenv("DOCGEN_SKIP_PDF", raising=False)

    called = {"n": 0}

    def _fake_convert(docx_path, output_dir):
        called["n"] += 1
        return None, "pdf unavailable in unit test"

    monkeypatch.setattr(
        "routers.org_documents.try_convert_to_pdf", _fake_convert
    )

    client_a = dual_org_clients["client_a"]
    dt = client_a.post(
        "/api/platform/document-types/",
        json={"name": "PDF Path", "slug": "pdf-path"},
    ).json()
    flow = client_a.post(f"/api/platform/{dt['id']}/flow", json={}).json()
    step = client_a.post(
        f"/api/platform/{flow['id']}/steps",
        json={
            "step_type": "text_field",
            "order_index": 0,
            "label": "Name",
            "is_enabled": True,
        },
    ).json()
    client_a.post(
        f"/api/platform/steps/{step['id']}/fields",
        json={
            "field_key": "cand_name",
            "field_label": "Name",
            "field_type": "text",
            "is_required": True,
        },
    )
    client_a.post(f"/api/platform/{flow['id']}/publish")
    up = client_a.post(
        f"/api/platform/{dt['id']}/templates",
        files={
            "file": (
                "t.docx",
                _make_docx_bytes("cand_name"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    ).json()
    client_a.post(
        f"/api/platform/templates/{up['id']}/mappings",
        json={
            "mappings": [
                {"placeholder_key": "cand_name", "field_key": "cand_name"}
            ]
        },
    )

    gen = client_a.post(
        f"/api/platform/{dt['id']}/generate",
        json={"template_id": up["id"], "fields": {"cand_name": "Pat"}},
    )
    assert gen.status_code == 201, gen.text
    assert called["n"] == 1

"""Supabase Storage for platform generated documents."""

from __future__ import annotations

import io
import os
from pathlib import Path
from unittest.mock import patch

import models
from services.generated_document_storage import (
    GENERATED_BUCKET,
    UNAVAILABLE_DETAIL,
    get_generated_document_bytes,
    persist_local_generated_pair,
    remote_stored_path,
)
from services.logo_storage import SB_PREFIX


MINIMAL_PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
MINIMAL_DOCX = b"PK\x03\x04fake-docx-bytes-for-storage-test"


def _seed_remote_pdf(dual_org_clients, *, org_key="org_a") -> models.GeneratedDocument:
    db = dual_org_clients["db"]
    org_bundle = dual_org_clients[org_key]
    org = org_bundle["org"]
    user = org_bundle["user"]
    doc = models.GeneratedDocument(
        user_id=user.id,
        template_id=None,
        form_data_json="{}",
        docx_filename=None,
        pdf_filename=None,
        org_id=org.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    doc.pdf_filename = remote_stored_path(org.id, doc.id, "pdf")
    db.commit()
    db.refresh(doc)
    return doc


def test_persist_uploads_and_cleans_local(tmp_path, monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test")
    monkeypatch.setenv("ENVIRONMENT", "development")

    docx = tmp_path / "out.docx"
    pdf = tmp_path / "out.pdf"
    docx.write_bytes(MINIMAL_DOCX)
    pdf.write_bytes(MINIMAL_PDF)

    uploaded = {}

    def _fake_request(method, path, data=None, headers=None):
        if method == "POST" and path == "/storage/v1/bucket":
            return b"{}"
        if method == "POST" and "/storage/v1/object/" in path:
            uploaded[path] = data
            return b"{}"
        raise AssertionError(f"unexpected request {method} {path}")

    with patch(
        "services.generated_document_storage.ensure_generated_bucket"
    ), patch(
        "services.generated_document_storage._request",
        side_effect=_fake_request,
    ):
        docx_ref, pdf_ref = persist_local_generated_pair(
            org_id="org-uuid-1",
            document_id=42,
            local_docx_path=str(docx),
            local_pdf_path=str(pdf),
            output_dir=str(tmp_path),
        )

    assert docx_ref == f"{SB_PREFIX}{GENERATED_BUCKET}/org-uuid-1/42.docx"
    assert pdf_ref == f"{SB_PREFIX}{GENERATED_BUCKET}/org-uuid-1/42.pdf"
    assert not docx.exists()
    assert not pdf.exists()
    assert any(path.endswith("/org-uuid-1/42.docx") for path in uploaded)
    assert any(path.endswith("/org-uuid-1/42.pdf") for path in uploaded)
    assert uploaded[
        f"/storage/v1/object/{GENERATED_BUCKET}/org-uuid-1/42.docx"
    ] == MINIMAL_DOCX


def test_persist_upload_failure_raises_and_keeps_no_silent_success(tmp_path, monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test")

    docx = tmp_path / "fail.docx"
    docx.write_bytes(MINIMAL_DOCX)

    def _boom(method, path, data=None, headers=None):
        if method == "POST" and path == "/storage/v1/bucket":
            return b"{}"
        import urllib.error

        raise urllib.error.HTTPError(
            url=path, code=500, msg="boom", hdrs=None, fp=io.BytesIO(b"err")
        )

    with patch(
        "services.generated_document_storage.ensure_generated_bucket"
    ), patch(
        "services.generated_document_storage._request",
        side_effect=_boom,
    ):
        from services.generated_document_storage import GeneratedDocumentStorageError

        try:
            persist_local_generated_pair(
                org_id="org-x",
                document_id=1,
                local_docx_path=str(docx),
                local_pdf_path=None,
                output_dir=str(tmp_path),
            )
            assert False, "expected GeneratedDocumentStorageError"
        except GeneratedDocumentStorageError as exc:
            assert "Failed to upload" in str(exc)


def test_generate_upload_failure_rolls_back_row(dual_org_clients, monkeypatch):
    """Generate must not leave a broken GeneratedDocument when storage upload fails."""
    from tests.test_phase3_platform import (
        _make_docx_bytes,
        _setup_published_flow_with_field,
    )

    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    setup = _setup_published_flow_with_field(client_a, slug="gen-storage-fail")
    up = client_a.post(
        f"/api/platform/{setup['dt_id']}/templates",
        files={
            "file": (
                "t.docx",
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

    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test")
    monkeypatch.setenv("ENVIRONMENT", "development")

    from services.generated_document_storage import GeneratedDocumentStorageError

    before = db.query(models.GeneratedDocument).count()

    with patch(
        "routers.org_documents.persist_local_generated_pair",
        side_effect=GeneratedDocumentStorageError("simulated upload failure"),
    ):
        resp = client_a.post(
            f"/api/platform/{setup['dt_id']}/generate",
            json={"template_id": tmpl_id, "fields": {setup["field_key"]: "Ada"}},
        )

    assert resp.status_code == 502, resp.text
    assert "simulated upload failure" in resp.json()["detail"]
    db.expire_all()
    assert db.query(models.GeneratedDocument).count() == before


def test_generate_with_storage_stores_sb_refs(dual_org_clients, monkeypatch):
    from tests.test_phase3_platform import (
        _make_docx_bytes,
        _setup_published_flow_with_field,
    )

    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    org_id = dual_org_clients["org_a"]["org"].id
    setup = _setup_published_flow_with_field(client_a, slug="gen-storage-ok")
    up = client_a.post(
        f"/api/platform/{setup['dt_id']}/templates",
        files={
            "file": (
                "t.docx",
                _make_docx_bytes("cand_name"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert up.status_code == 201
    tmpl_id = up.json()["id"]
    assert (
        client_a.post(
            f"/api/platform/templates/{tmpl_id}/mappings",
            json={
                "mappings": [
                    {"placeholder_key": "cand_name", "field_key": setup["field_key"]}
                ]
            },
        ).status_code
        == 200
    )

    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test")

    def _fake_persist(**kwargs):
        # Simulate successful remote upload + local cleanup
        for p in (kwargs["local_docx_path"], kwargs.get("local_pdf_path")):
            if p and os.path.exists(p):
                os.unlink(p)
        did = kwargs["document_id"]
        return (
            remote_stored_path(org_id, did, "docx"),
            None,  # DOCGEN_SKIP_PDF=true in tests
        )

    with patch(
        "routers.org_documents.persist_local_generated_pair",
        side_effect=_fake_persist,
    ):
        resp = client_a.post(
            f"/api/platform/{setup['dt_id']}/generate",
            json={"template_id": tmpl_id, "fields": {setup["field_key"]: "Bea"}},
        )

    assert resp.status_code == 201, resp.text
    doc_id = resp.json()["document_id"]
    row = db.query(models.GeneratedDocument).filter_by(id=doc_id).one()
    assert row.docx_filename.startswith(f"{SB_PREFIX}{GENERATED_BUCKET}/")
    assert str(doc_id) in row.docx_filename
    # Local temp cleaned (no leftover matching unique name under OUTPUT_DIR)
    leftovers = [
        p
        for p in Path(os.environ["OUTPUT_DIR"]).rglob("*.docx")
        if f"_{doc_id}." in p.name or row.docx_filename.endswith(p.name)
    ]
    assert leftovers == []


def test_download_share_telegram_fetch_from_supabase(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]
    doc = _seed_remote_pdf(dual_org_clients)

    def _fake_get_bytes(**kwargs):
        assert kwargs["stored_path"] == doc.pdf_filename
        assert kwargs["stored_path"].startswith("sb://")
        return MINIMAL_PDF, "application/pdf", f"document_{doc.id}.pdf"

    monkeypatch.setattr(
        "routers.org_documents.get_generated_document_bytes",
        _fake_get_bytes,
    )
    monkeypatch.setattr(
        "routers.public.get_generated_document_bytes",
        _fake_get_bytes,
    )

    # Download / in-app preview path
    dl = client_a.get(f"/api/platform/generated/{doc.id}/download?format=pdf")
    assert dl.status_code == 200
    assert dl.content == MINIMAL_PDF

    # Share link + public fetch
    created = client_a.post(f"/api/platform/generated/{doc.id}/share-link")
    assert created.status_code == 200, created.text
    token = created.json()["token"]
    from fastapi.testclient import TestClient
    from main import app

    public = TestClient(app)
    got = public.get(f"/api/public/shared/{token}")
    assert got.status_code == 200
    assert got.content == MINIMAL_PDF

    # Telegram send (mocked Bot API)
    contact = client_a.post(
        "/api/platform/telegram-contacts",
        json={"label": "Remote", "chat_id": "777"},
    ).json()
    calls = []
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "tok")
    monkeypatch.setattr(
        "routers.org_documents.telegram_send_document",
        lambda **kw: calls.append(kw) or {"ok": True},
    )
    # Re-patch get bytes on org_documents (telegram uses _read → get_generated)
    monkeypatch.setattr(
        "routers.org_documents.get_generated_document_bytes",
        _fake_get_bytes,
    )
    tg = client_a.post(
        f"/api/platform/generated/{doc.id}/send-telegram",
        json={"telegram_contact_id": contact["id"]},
    )
    assert tg.status_code == 200, tg.text
    assert calls and calls[0]["file_bytes"] == MINIMAL_PDF


def test_missing_local_file_returns_honest_unavailable(dual_org_clients):
    db = dual_org_clients["db"]
    org = dual_org_clients["org_a"]["org"]
    user = dual_org_clients["org_a"]["user"]
    client_a = dual_org_clients["client_a"]

    doc = models.GeneratedDocument(
        user_id=user.id,
        template_id=None,
        form_data_json="{}",
        docx_filename=None,
        pdf_filename=f"orgs/{org.id}/gone-forever.pdf",
        org_id=org.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    resp = client_a.get(f"/api/platform/generated/{doc.id}/download?format=pdf")
    assert resp.status_code == 410
    assert "no longer available" in resp.json()["detail"].lower()

    share = client_a.post(f"/api/platform/generated/{doc.id}/share-link")
    assert share.status_code == 410
    assert "no longer available" in share.json()["detail"].lower()


def test_cross_org_cannot_download_remote_stored_doc(dual_org_clients, monkeypatch):
    client_b = dual_org_clients["client_b"]
    doc = _seed_remote_pdf(dual_org_clients, org_key="org_a")

    called = {"n": 0}

    def _should_not_read(**kwargs):
        called["n"] += 1
        return MINIMAL_PDF, "application/pdf", "x.pdf"

    monkeypatch.setattr(
        "routers.org_documents.get_generated_document_bytes",
        _should_not_read,
    )
    denied = client_b.get(f"/api/platform/generated/{doc.id}/download?format=pdf")
    assert denied.status_code == 404
    assert called["n"] == 0


def test_get_generated_document_bytes_helper_local(tmp_path):
    rel = "orgs/x/sample.pdf"
    path = tmp_path / "orgs" / "x" / "sample.pdf"
    path.parent.mkdir(parents=True)
    path.write_bytes(MINIMAL_PDF)
    data, media, name = get_generated_document_bytes(
        stored_path=rel,
        local_output_dir=str(tmp_path),
        format="pdf",
        document_id=9,
    )
    assert data == MINIMAL_PDF
    assert media == "application/pdf"
    assert name == "sample.pdf"

    try:
        get_generated_document_bytes(
            stored_path="orgs/x/missing.pdf",
            local_output_dir=str(tmp_path),
            format="pdf",
            document_id=9,
        )
        assert False
    except Exception as exc:
        assert UNAVAILABLE_DETAIL in str(exc)

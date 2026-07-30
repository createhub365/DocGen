"""Share links, Telegram send, and email attachment tests."""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from pathlib import Path

import models


MINIMAL_PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def _seed_generated_pdf(dual_org_clients, *, org_key="org_a") -> models.GeneratedDocument:
    db = dual_org_clients["db"]
    org_bundle = dual_org_clients[org_key]
    org = org_bundle["org"]
    user = org_bundle["user"]

    rel = f"{org.id}/share-test-{os.urandom(4).hex()}.pdf"
    path = Path(os.environ["OUTPUT_DIR"]) / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(MINIMAL_PDF)

    doc = models.GeneratedDocument(
        user_id=user.id,
        template_id=None,
        form_data_json="{}",
        docx_filename=None,
        pdf_filename=rel.replace("\\", "/"),
        org_id=org.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def _staff_client(dual_org_clients, *, email: str = "staff.share@example.com"):
    from auth import create_org_jwt, hash_password

    db = dual_org_clients["db"]
    org = dual_org_clients["org_a"]["org"]
    user = models.User(
        username=email,
        full_name="Staff Share",
        password_hash=hash_password("test-password-123"),
        role="staff",
        is_active=True,
    )
    db.add(user)
    db.flush()
    db.add(models.OrgUser(org_id=org.id, user_id=user.id, role="staff"))
    db.commit()
    token = create_org_jwt(user_id=user.id, org_id=org.id, role="staff")
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)
    client.cookies.set("platform_access_token", token)
    return client


# ---- Share tokens ----


def test_create_share_link_and_public_download(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    doc = _seed_generated_pdf(dual_org_clients)

    created = client_a.post(f"/api/platform/generated/{doc.id}/share-link")
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["token"]
    assert body["share_url"].endswith(f"/api/public/shared/{body['token']}")
    assert "expires_at" in body

    # Public (no auth cookie) download
    from fastapi.testclient import TestClient
    from main import app

    public = TestClient(app)
    got = public.get(f"/api/public/shared/{body['token']}")
    assert got.status_code == 200, got.text
    assert got.headers["content-type"].startswith("application/pdf")
    assert got.content == MINIMAL_PDF

    # Reusable until expiry — second fetch still works
    got2 = public.get(f"/api/public/shared/{body['token']}")
    assert got2.status_code == 200
    assert got2.content == MINIMAL_PDF


def test_expired_share_token_returns_clean_page(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    doc = _seed_generated_pdf(dual_org_clients)

    created = client_a.post(f"/api/platform/generated/{doc.id}/share-link")
    assert created.status_code == 200, created.text
    token = created.json()["token"]

    row = (
        db.query(models.DocumentShareToken)
        .filter(models.DocumentShareToken.token == token)
        .first()
    )
    row.expires_at = datetime.utcnow() - timedelta(minutes=1)
    db.commit()

    from fastapi.testclient import TestClient
    from main import app

    public = TestClient(app)
    got = public.get(f"/api/public/shared/{token}")
    assert got.status_code == 410
    assert "expired" in got.text.lower()


def test_invalid_share_token_returns_clean_page(dual_org_clients):
    from fastapi.testclient import TestClient
    from main import app

    public = TestClient(app)
    got = public.get("/api/public/shared/this-token-does-not-exist-at-all-xx")
    assert got.status_code == 410
    assert "unavailable" in got.text.lower() or "expired" in got.text.lower()


def test_cross_org_cannot_create_share_link(dual_org_clients):
    client_b = dual_org_clients["client_b"]
    doc = _seed_generated_pdf(dual_org_clients, org_key="org_a")

    resp = client_b.post(f"/api/platform/generated/{doc.id}/share-link")
    assert resp.status_code == 404


def test_staff_can_create_share_link(dual_org_clients):
    doc = _seed_generated_pdf(dual_org_clients)
    staff = _staff_client(dual_org_clients)
    resp = staff.post(f"/api/platform/generated/{doc.id}/share-link")
    assert resp.status_code == 200, resp.text
    staff.close()


# ---- Telegram contacts + send ----


def test_telegram_contact_crud_org_scoped(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]

    created = client_a.post(
        "/api/platform/telegram-contacts",
        json={"label": "HR Apex", "chat_id": "12345"},
    )
    assert created.status_code == 201, created.text
    cid = created.json()["id"]

    listed_a = client_a.get("/api/platform/telegram-contacts").json()
    assert any(row["id"] == cid for row in listed_a)

    listed_b = client_b.get("/api/platform/telegram-contacts").json()
    assert all(row["id"] != cid for row in listed_b)

    assert (
        client_b.patch(
            f"/api/platform/telegram-contacts/{cid}",
            json={"label": "Hacked"},
        ).status_code
        == 404
    )
    assert client_b.delete(f"/api/platform/telegram-contacts/{cid}").status_code == 404

    patched = client_a.patch(
        f"/api/platform/telegram-contacts/{cid}",
        json={"label": "HR Apex Updated"},
    )
    assert patched.status_code == 200
    assert patched.json()["label"] == "HR Apex Updated"

    deleted = client_a.delete(f"/api/platform/telegram-contacts/{cid}")
    assert deleted.status_code == 200


def test_staff_can_list_but_not_manage_telegram_contacts(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    staff = _staff_client(dual_org_clients, email="staff.tg@example.com")

    created = client_a.post(
        "/api/platform/telegram-contacts",
        json={"label": "Ops", "chat_id": "999"},
    )
    assert created.status_code == 201

    assert staff.get("/api/platform/telegram-contacts").status_code == 200
    assert (
        staff.post(
            "/api/platform/telegram-contacts",
            json={"label": "Nope", "chat_id": "1"},
        ).status_code
        == 403
    )
    staff.close()


def test_send_telegram_mocks_api_and_handles_errors(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]
    doc = _seed_generated_pdf(dual_org_clients)
    contact = client_a.post(
        "/api/platform/telegram-contacts",
        json={"label": "Finance", "chat_id": "424242"},
    ).json()

    calls = []

    def _fake_send(**kwargs):
        calls.append(kwargs)
        return {"ok": True}

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-bot-token")
    monkeypatch.setattr(
        "routers.org_documents.telegram_send_document",
        _fake_send,
    )

    ok = client_a.post(
        f"/api/platform/generated/{doc.id}/send-telegram",
        json={"telegram_contact_id": contact["id"]},
    )
    assert ok.status_code == 200, ok.text
    assert len(calls) == 1
    assert calls[0]["chat_id"] == "424242"
    assert calls[0]["file_bytes"] == MINIMAL_PDF

    def _boom(**kwargs):
        raise ValueError("Forbidden: bot was blocked by the user")

    monkeypatch.setattr(
        "routers.org_documents.telegram_send_document",
        _boom,
    )
    fail = client_a.post(
        f"/api/platform/generated/{doc.id}/send-telegram",
        json={"telegram_contact_id": contact["id"]},
    )
    assert fail.status_code == 400
    assert "blocked" in fail.json()["detail"].lower()


def test_send_telegram_cross_org_isolated(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    doc = _seed_generated_pdf(dual_org_clients, org_key="org_a")
    contact = client_a.post(
        "/api/platform/telegram-contacts",
        json={"label": "A only", "chat_id": "111"},
    ).json()

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-bot-token")
    monkeypatch.setattr(
        "routers.org_documents.telegram_send_document",
        lambda **kwargs: {"ok": True},
    )

    assert (
        client_b.post(
            f"/api/platform/generated/{doc.id}/send-telegram",
            json={"telegram_contact_id": contact["id"]},
        ).status_code
        == 404
    )


# ---- Email ----


def test_send_email_success_mocked_smtp(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]
    doc = _seed_generated_pdf(dual_org_clients)

    monkeypatch.setenv("SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("SMTP_FROM", "noreply@example.com")
    monkeypatch.setenv("SMTP_PORT", "587")

    sent = {}

    class _FakeSMTP:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self):
            return None

        def login(self, *a):
            return None

        def send_message(self, msg):
            sent["to"] = msg["To"]
            sent["subject"] = msg["Subject"]
            # EmailMessage walks attachments via iter_attachments
            atts = list(msg.iter_attachments())
            sent["attachments"] = len(atts)
            if atts:
                sent["filename"] = atts[0].get_filename()
                sent["payload"] = atts[0].get_content()

    monkeypatch.setattr("services.document_email.smtplib.SMTP", _FakeSMTP)

    resp = client_a.post(
        f"/api/platform/generated/{doc.id}/send-email",
        json={
            "recipient_email": "recipient@example.com",
            "message": "Please review",
        },
    )
    assert resp.status_code == 200, resp.text
    assert sent["to"] == "recipient@example.com"
    assert sent["attachments"] == 1
    assert sent["payload"] == MINIMAL_PDF


def test_send_email_smtp_failure_surfaces_error(dual_org_clients, monkeypatch):
    client_a = dual_org_clients["client_a"]
    doc = _seed_generated_pdf(dual_org_clients)

    monkeypatch.setenv("SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("SMTP_FROM", "noreply@example.com")

    class _BoomSMTP:
        def __init__(self, *a, **k):
            raise OSError("connection refused")

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr("services.document_email.smtplib.SMTP", _BoomSMTP)

    resp = client_a.post(
        f"/api/platform/generated/{doc.id}/send-email",
        json={"recipient_email": "someone@example.com"},
    )
    assert resp.status_code == 400
    assert "email" in resp.json()["detail"].lower() or "smtp" in resp.json()[
        "detail"
    ].lower() or "failed" in resp.json()["detail"].lower()


def test_send_email_cross_org_isolated(dual_org_clients, monkeypatch):
    client_b = dual_org_clients["client_b"]
    doc = _seed_generated_pdf(dual_org_clients, org_key="org_a")
    monkeypatch.setenv("SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("SMTP_FROM", "noreply@example.com")

    resp = client_b.post(
        f"/api/platform/generated/{doc.id}/send-email",
        json={"recipient_email": "x@example.com"},
    )
    assert resp.status_code == 404


def test_share_link_audit_logged(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    doc = _seed_generated_pdf(dual_org_clients)
    assert client_a.post(f"/api/platform/generated/{doc.id}/share-link").status_code == 200
    db.expire_all()
    logs = (
        db.query(models.AuditLog)
        .filter(models.AuditLog.action == "share_link.created")
        .all()
    )
    assert any(log.target_id == str(doc.id) for log in logs)

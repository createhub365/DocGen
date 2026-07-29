"""Organization branding logo upload / serve."""
from __future__ import annotations

import io

from models import Organization
from tests.test_phase12_option_lists import _staff_client


def _png_bytes() -> bytes:
    # Minimal valid 1x1 PNG
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
        b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def _upload_logo(client, *, filename="logo.png", content=None, content_type="image/png"):
    raw = content if content is not None else _png_bytes()
    files = {"file": (filename, io.BytesIO(raw), content_type)}
    return client.post("/api/platform/organization/logo", files=files)


def test_upload_logo_retrievable_and_me_flag(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    before = client_a.get("/api/platform/me")
    assert before.status_code == 200, before.text
    assert before.json()["organization"]["has_logo"] is False
    assert before.json()["organization"]["logo_url"] is None

    missing = client_a.get("/api/platform/organization/logo")
    assert missing.status_code == 404

    up = _upload_logo(client_a)
    assert up.status_code == 200, up.text
    body = up.json()
    assert body["has_logo"] is True
    assert body["logo_url"] == "/api/platform/organization/logo"

    got = client_a.get("/api/platform/organization/logo")
    assert got.status_code == 200, got.text
    assert got.headers["content-type"].startswith("image/")
    assert len(got.content) > 20

    me = client_a.get("/api/platform/me")
    assert me.status_code == 200
    assert me.json()["organization"]["has_logo"] is True

    db.expire_all()
    org = db.query(Organization).filter(Organization.id == body["id"]).first()
    assert org is not None
    assert org.logo_path
    assert f"orgs/{org.id}/" in org.logo_path.replace("\\", "/")


def test_logo_is_org_scoped(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]

    assert _upload_logo(client_a).status_code == 200
    assert client_a.get("/api/platform/organization/logo").status_code == 200

    # Org B has no logo of its own → 404 (cannot see A's file via this route)
    assert client_b.get("/api/platform/organization/logo").status_code == 404
    me_b = client_b.get("/api/platform/me")
    assert me_b.json()["organization"]["has_logo"] is False


def test_staff_cannot_upload_logo(dual_org_clients):
    staff = _staff_client(dual_org_clients, email="staff.logo@example.com")
    resp = _upload_logo(staff)
    assert resp.status_code == 403


def test_rejects_invalid_type_and_oversized(dual_org_clients):
    client_a = dual_org_clients["client_a"]

    bad_type = _upload_logo(
        client_a,
        filename="logo.gif",
        content=b"GIF89a",
        content_type="image/gif",
    )
    assert bad_type.status_code == 400

    too_big = _upload_logo(
        client_a,
        filename="huge.png",
        content=b"x" * (2 * 1024 * 1024 + 1),
        content_type="image/png",
    )
    assert too_big.status_code == 400
    assert "2MB" in too_big.json()["detail"]


def test_replace_and_delete_logo(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    first = _upload_logo(client_a)
    assert first.status_code == 200
    path1 = (
        db.query(Organization)
        .filter(Organization.id == first.json()["id"])
        .first()
        .logo_path
    )

    second = client_a.patch(
        "/api/platform/organization/logo",
        files={"file": ("logo2.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    assert second.status_code == 200, second.text
    db.expire_all()
    path2 = (
        db.query(Organization)
        .filter(Organization.id == second.json()["id"])
        .first()
        .logo_path
    )
    assert path2 != path1

    deleted = client_a.delete("/api/platform/organization/logo")
    assert deleted.status_code == 200
    assert deleted.json()["has_logo"] is False
    assert client_a.get("/api/platform/organization/logo").status_code == 404


def test_remote_upload_uses_org_logos_bucket_not_template_documents(dual_org_clients, monkeypatch):
    """Regression: images must not upload to template-documents (MIME 400 → 500)."""
    import services.logo_storage as logo_storage

    calls = []

    def fake_enabled():
        return True

    def fake_ensure(bucket="employer-logos"):
        calls.append(("ensure", bucket))

    def fake_request(method, path, data=None, headers=None):
        calls.append((method, path, (headers or {}).get("Content-Type")))
        if "template-documents" in path:
            raise logo_storage.urllib.error.HTTPError(
                path, 400, "Bad Request", hdrs=None, fp=None
            )
        return b""

    monkeypatch.setattr(logo_storage, "storage_enabled", fake_enabled)
    monkeypatch.setattr(logo_storage, "ensure_bucket", fake_ensure)
    monkeypatch.setattr(logo_storage, "_request", fake_request)

    client_a = dual_org_clients["client_a"]
    up = _upload_logo(client_a)
    assert up.status_code == 200, up.text
    assert up.json()["has_logo"] is True

    post_calls = [c for c in calls if c[0] == "POST"]
    assert post_calls, calls
    assert any("org-logos/" in c[1] for c in post_calls), post_calls
    assert not any("template-documents/" in c[1] for c in post_calls), post_calls

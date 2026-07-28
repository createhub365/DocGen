"""Org template thumbnail generation + serve (reuses legacy thumbnail services)."""
from __future__ import annotations

from unittest.mock import patch

from models import Template
from tests.test_phase3_platform import _make_docx_bytes, _setup_published_flow_with_field


def _upload(client, dt_id, *, filename="preview.docx", placeholder="cand_name"):
    files = {
        "file": (
            filename,
            _make_docx_bytes(placeholder),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    }
    return client.post(f"/api/platform/{dt_id}/templates", files=files)


def test_upload_generates_thumbnail_and_endpoint_returns_png(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    setup = _setup_published_flow_with_field(client_a, slug="thumb-ok")

    up = _upload(client_a, setup["dt_id"])
    assert up.status_code == 201, up.text
    body = up.json()
    tmpl_id = body["id"]
    assert body.get("has_thumbnail") is True

    db.expire_all()
    row = db.query(Template).filter(Template.id == tmpl_id).first()
    assert row is not None
    assert row.thumbnail_path
    assert "thumbnails/" in row.thumbnail_path.replace("\\", "/")
    assert str(row.org_id) in row.thumbnail_path.replace("\\", "/")

    listed = client_a.get(f"/api/platform/{setup['dt_id']}/templates").json()
    match = next(r for r in listed if r["id"] == tmpl_id)
    assert match["has_thumbnail"] is True

    thumb = client_a.get(
        f"/api/platform/{setup['dt_id']}/templates/{tmpl_id}/thumbnail"
    )
    assert thumb.status_code == 200, thumb.text
    assert thumb.headers.get("content-type", "").startswith("image/png")
    assert thumb.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_upload_succeeds_when_thumbnail_generation_fails(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    setup = _setup_published_flow_with_field(client_a, slug="thumb-fail")

    with patch(
        "routers.org_templates.generate_docx_thumbnail",
        side_effect=RuntimeError("forced thumbnail failure"),
    ):
        up = _upload(client_a, setup["dt_id"], filename="still_ok.docx")

    assert up.status_code == 201, up.text
    body = up.json()
    assert body["id"]
    assert body.get("has_thumbnail") is False
    assert "placeholders" in body

    db.expire_all()
    row = db.query(Template).filter(Template.id == body["id"]).first()
    assert row is not None
    assert row.thumbnail_path is None

    missing = client_a.get(
        f"/api/platform/{setup['dt_id']}/templates/{body['id']}/thumbnail"
    )
    assert missing.status_code == 404


def test_cross_org_cannot_fetch_template_thumbnail(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    setup = _setup_published_flow_with_field(client_a, slug="thumb-iso")

    up = _upload(client_a, setup["dt_id"])
    assert up.status_code == 201, up.text
    tmpl_id = up.json()["id"]
    assert up.json().get("has_thumbnail") is True

    # Org B: wrong org → 404 (document type / template not in B's scope)
    blocked = client_b.get(
        f"/api/platform/{setup['dt_id']}/templates/{tmpl_id}/thumbnail"
    )
    assert blocked.status_code == 404


def test_download_org_template_docx_and_cross_org_blocked(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    setup = _setup_published_flow_with_field(client_a, slug="docx-dl")

    up = _upload(client_a, setup["dt_id"], filename="offer.docx")
    assert up.status_code == 201, up.text
    tmpl_id = up.json()["id"]

    dl = client_a.get(f"/api/platform/{setup['dt_id']}/templates/{tmpl_id}/download")
    assert dl.status_code == 200, dl.text
    assert "officedocument.wordprocessingml.document" in dl.headers.get(
        "content-type", ""
    )
    assert dl.content[:2] == b"PK"

    blocked = client_b.get(
        f"/api/platform/{setup['dt_id']}/templates/{tmpl_id}/download"
    )
    assert blocked.status_code == 404

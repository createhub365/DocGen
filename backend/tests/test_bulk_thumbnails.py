"""Bulk thumbnail regenerate + content-hash change detection."""
from __future__ import annotations

from unittest.mock import patch

from models import AuditLog, Template
from routers.org_templates import hash_docx_file, _resolve_stored_template_path
from tests.test_phase3_platform import _make_docx_bytes, _setup_published_flow_with_field


def _upload(client, dt_id, *, filename="doc.docx", placeholder="cand_name"):
    files = {
        "file": (
            filename,
            _make_docx_bytes(placeholder),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    }
    return client.post(f"/api/platform/{dt_id}/templates", files=files)


def test_bulk_creates_missing_thumbnail(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    setup = _setup_published_flow_with_field(client_a, slug="bulk-create")

    up = _upload(client_a, setup["dt_id"])
    assert up.status_code == 201, up.text
    tmpl_id = up.json()["id"]

    # Simulate a pre-feature template (no thumbnail / hash)
    db.expire_all()
    row = db.query(Template).filter(Template.id == tmpl_id).first()
    row.thumbnail_path = None
    row.thumbnail_source_hash = None
    db.commit()

    resp = client_a.post("/api/platform/settings/regenerate-thumbnails")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 1
    assert body["created"] == 1
    assert body["updated"] == 0
    assert body["unchanged"] == 0
    assert body["failed"] == 0

    db.expire_all()
    row = db.query(Template).filter(Template.id == tmpl_id).first()
    assert row.thumbnail_path
    assert row.thumbnail_source_hash
    assert len(row.thumbnail_source_hash) == 64


def test_bulk_skips_unchanged_without_regenerating(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    setup = _setup_published_flow_with_field(client_a, slug="bulk-skip")

    up = _upload(client_a, setup["dt_id"])
    assert up.status_code == 201, up.text
    tmpl_id = up.json()["id"]
    assert up.json().get("has_thumbnail") is True

    db.expire_all()
    row = db.query(Template).filter(Template.id == tmpl_id).first()
    assert row.thumbnail_path
    assert row.thumbnail_source_hash
    path_before = row.thumbnail_path
    hash_before = row.thumbnail_source_hash

    with patch(
        "routers.org_templates.generate_docx_thumbnail"
    ) as gen_mock:
        resp = client_a.post("/api/platform/settings/regenerate-thumbnails")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["unchanged"] == 1
        assert body["created"] == 0
        assert body["updated"] == 0
        assert body["failed"] == 0
        gen_mock.assert_not_called()

    db.expire_all()
    row = db.query(Template).filter(Template.id == tmpl_id).first()
    assert row.thumbnail_path == path_before
    assert row.thumbnail_source_hash == hash_before


def test_bulk_updates_when_hash_mismatches(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    setup = _setup_published_flow_with_field(client_a, slug="bulk-update")

    up = _upload(client_a, setup["dt_id"])
    assert up.status_code == 201, up.text
    tmpl_id = up.json()["id"]

    db.expire_all()
    row = db.query(Template).filter(Template.id == tmpl_id).first()
    assert row.thumbnail_path
    row.thumbnail_source_hash = "0" * 64  # force stale
    db.commit()

    from services.thumbnail_gen import generate_docx_thumbnail as real_gen

    with patch(
        "routers.org_templates.generate_docx_thumbnail", side_effect=real_gen
    ) as gen_mock:
        resp = client_a.post("/api/platform/settings/regenerate-thumbnails")
        assert resp.status_code == 200, resp.text
        assert gen_mock.call_count == 1

    body = resp.json()
    assert body["updated"] == 1
    assert body["created"] == 0
    assert body["unchanged"] == 0
    assert body["failed"] == 0

    db.expire_all()
    row = db.query(Template).filter(Template.id == tmpl_id).first()
    assert row.thumbnail_path
    assert row.thumbnail_source_hash != "0" * 64
    docx_path = _resolve_stored_template_path(row.docx_filename)
    assert row.thumbnail_source_hash == hash_docx_file(docx_path)


def test_bulk_continues_when_one_template_fails(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    setup = _setup_published_flow_with_field(client_a, slug="bulk-partial")

    up1 = _upload(client_a, setup["dt_id"], filename="ok1.docx", placeholder="a_name")
    up2 = _upload(client_a, setup["dt_id"], filename="bad.docx", placeholder="b_name")
    up3 = _upload(client_a, setup["dt_id"], filename="ok3.docx", placeholder="c_name")
    assert up1.status_code == 201
    assert up2.status_code == 201
    assert up3.status_code == 201
    id_ok1, id_bad, id_ok3 = up1.json()["id"], up2.json()["id"], up3.json()["id"]

    # Clear thumbs so bulk will attempt generation for all three
    db.expire_all()
    for tid in (id_ok1, id_bad, id_ok3):
        row = db.query(Template).filter(Template.id == tid).first()
        row.thumbnail_path = None
        row.thumbnail_source_hash = None
    db.commit()

    real_gen = __import__(
        "services.thumbnail_gen", fromlist=["generate_docx_thumbnail"]
    ).generate_docx_thumbnail

    def selective_gen(docx_path, thumbnail_dir, template_id, width_px=None):
        if template_id == id_bad:
            raise RuntimeError("forced failure for one template")
        return real_gen(docx_path, thumbnail_dir, template_id, width_px=width_px)

    with patch("routers.org_templates.generate_docx_thumbnail", side_effect=selective_gen):
        resp = client_a.post("/api/platform/settings/regenerate-thumbnails")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 3
    assert body["created"] == 2
    assert body["failed"] == 1
    assert body["unchanged"] == 0
    assert any(d["template_id"] == id_bad for d in body["failed_details"])

    db.expire_all()
    assert db.query(Template).filter(Template.id == id_ok1).first().thumbnail_path
    assert db.query(Template).filter(Template.id == id_ok3).first().thumbnail_path
    assert db.query(Template).filter(Template.id == id_bad).first().thumbnail_path is None


def test_bulk_is_org_scoped(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    db = dual_org_clients["db"]

    setup_a = _setup_published_flow_with_field(client_a, slug="bulk-iso-a")
    setup_b = _setup_published_flow_with_field(client_b, slug="bulk-iso-b")

    up_a = _upload(client_a, setup_a["dt_id"], filename="a.docx")
    up_b = _upload(client_b, setup_b["dt_id"], filename="b.docx")
    assert up_a.status_code == 201
    assert up_b.status_code == 201
    id_a, id_b = up_a.json()["id"], up_b.json()["id"]

    db.expire_all()
    for tid in (id_a, id_b):
        row = db.query(Template).filter(Template.id == tid).first()
        row.thumbnail_path = None
        row.thumbnail_source_hash = None
    db.commit()

    resp_b = client_b.post("/api/platform/settings/regenerate-thumbnails")
    assert resp_b.status_code == 200, resp_b.text
    body_b = resp_b.json()
    assert body_b["total"] == 1
    assert body_b["created"] == 1

    db.expire_all()
    row_a = db.query(Template).filter(Template.id == id_a).first()
    row_b = db.query(Template).filter(Template.id == id_b).first()
    assert row_a.thumbnail_path is None  # org A untouched
    assert row_b.thumbnail_path  # org B regenerated

    # Audit logged for org B only
    org_b_id = dual_org_clients["org_b"]["org"].id
    org_a_id = dual_org_clients["org_a"]["org"].id
    audits = (
        db.query(AuditLog)
        .filter(AuditLog.action == "thumbnails.bulk_regenerated")
        .all()
    )
    assert any(a.org_id == org_b_id for a in audits)
    assert not any(a.org_id == org_a_id for a in audits)

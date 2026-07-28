"""Org template hard-delete — mappings gone, generated docs retained (SET NULL)."""
from __future__ import annotations

from pathlib import Path

from models import GeneratedDocument, PlaceholderMapping, Template
from tests.conftest import TEST_TEMPLATE_DIR
from tests.test_phase3_platform import _make_docx_bytes, _setup_published_flow_with_field
from tests.test_template_display_name import _upload


def _map_complete(client, tmpl_id, field_key, placeholder="cand_name"):
    mapped = client.post(
        f"/api/platform/templates/{tmpl_id}/mappings",
        json={
            "mappings": [
                {"placeholder_key": placeholder, "field_key": field_key},
            ]
        },
    )
    assert mapped.status_code == 200, mapped.text
    assert mapped.json()["is_complete"] is True


def test_delete_template_without_generated_docs(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    setup = _setup_published_flow_with_field(client_a, slug="del-clean")
    up = _upload(
        client_a,
        setup["dt_id"],
        filename="gone.docx",
        display_name="To Delete",
        placeholder="cand_name",
    )
    assert up.status_code == 201, up.text
    tmpl_id = up.json()["id"]
    _map_complete(client_a, tmpl_id, setup["field_key"])

    db.expire_all()
    row = db.query(Template).filter(Template.id == tmpl_id).first()
    assert row is not None
    stored = row.docx_filename
    local = Path(TEST_TEMPLATE_DIR) / stored.replace("/", "\\") if "\\" not in stored else Path(TEST_TEMPLATE_DIR) / stored
    # resolve relative to template store
    local = Path(TEST_TEMPLATE_DIR) / Path(*stored.replace("\\", "/").split("/"))
    assert local.exists(), str(local)

    mapping_before = (
        db.query(PlaceholderMapping).filter(PlaceholderMapping.template_id == tmpl_id).count()
    )
    assert mapping_before >= 1

    resp = client_a.delete(f"/api/platform/{setup['dt_id']}/templates/{tmpl_id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["deleted"] is True
    assert body["generated_documents_retained"] == 0

    db.expire_all()
    assert db.query(Template).filter(Template.id == tmpl_id).first() is None
    assert (
        db.query(PlaceholderMapping).filter(PlaceholderMapping.template_id == tmpl_id).count()
        == 0
    )
    assert not local.exists()


def test_delete_template_with_generated_docs_sets_null(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    setup = _setup_published_flow_with_field(client_a, slug="del-used")
    up = _upload(
        client_a,
        setup["dt_id"],
        filename="used.docx",
        display_name="Used Template",
        placeholder="cand_name",
    )
    assert up.status_code == 201, up.text
    tmpl_id = up.json()["id"]
    _map_complete(client_a, tmpl_id, setup["field_key"])

    gen = client_a.post(
        f"/api/platform/{setup['dt_id']}/generate",
        json={"template_id": tmpl_id, "fields": {setup["field_key"]: "Ada"}},
    )
    assert gen.status_code == 201, gen.text
    doc_id = gen.json()["document_id"]

    db.expire_all()
    before = db.query(GeneratedDocument).filter(GeneratedDocument.id == doc_id).first()
    assert before is not None
    assert before.template_id == tmpl_id
    docx_rel = before.docx_filename

    resp = client_a.delete(f"/api/platform/{setup['dt_id']}/templates/{tmpl_id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["generated_documents_retained"] == 1

    db.expire_all()
    assert db.query(Template).filter(Template.id == tmpl_id).first() is None
    after = db.query(GeneratedDocument).filter(GeneratedDocument.id == doc_id).first()
    assert after is not None
    assert after.template_id is None
    assert after.docx_filename == docx_rel

    # Historical download still works
    dl = client_a.get(f"/api/platform/generated/{doc_id}/download")
    assert dl.status_code == 200, dl.text


def test_delete_template_cross_org_blocked(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    db = dual_org_clients["db"]

    setup = _setup_published_flow_with_field(client_a, slug="del-isol")
    up = _upload(client_a, setup["dt_id"], filename="a.docx", display_name="A Only")
    assert up.status_code == 201, up.text
    tmpl_id = up.json()["id"]

    db.expire_all()
    before = db.query(Template).count()

    blocked = client_b.delete(f"/api/platform/{setup['dt_id']}/templates/{tmpl_id}")
    assert blocked.status_code == 404

    db.expire_all()
    assert db.query(Template).count() == before
    assert db.query(Template).filter(Template.id == tmpl_id).first() is not None


def test_delete_template_sibling_unaffected(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    setup = _setup_published_flow_with_field(client_a, slug="del-sib")
    up_a = _upload(
        client_a,
        setup["dt_id"],
        filename="a.docx",
        display_name="Keep Me",
        placeholder="cand_name",
    )
    up_b = _upload(
        client_a,
        setup["dt_id"],
        filename="b.docx",
        display_name="Delete Me",
        placeholder="cand_name",
    )
    assert up_a.status_code == 201 and up_b.status_code == 201
    keep_id = up_a.json()["id"]
    drop_id = up_b.json()["id"]
    _map_complete(client_a, keep_id, setup["field_key"])
    _map_complete(client_a, drop_id, setup["field_key"])

    resp = client_a.delete(f"/api/platform/{setup['dt_id']}/templates/{drop_id}")
    assert resp.status_code == 200, resp.text

    listed = client_a.get(f"/api/platform/{setup['dt_id']}/templates").json()
    ids = {r["id"] for r in listed}
    assert keep_id in ids
    assert drop_id not in ids

    # Sibling still generates
    gen = client_a.post(
        f"/api/platform/{setup['dt_id']}/generate",
        json={"template_id": keep_id, "fields": {setup["field_key"]: "Bob"}},
    )
    assert gen.status_code == 201, gen.text

    db.expire_all()
    assert db.query(Template).filter(Template.id == keep_id).first() is not None
    assert db.query(Template).filter(Template.id == drop_id).first() is None

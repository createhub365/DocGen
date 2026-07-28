"""Generate must honor explicit template_id (two templates under one type)."""
from __future__ import annotations

import json
from pathlib import Path

from docx import Document

from models import GeneratedDocument
from tests.conftest import TEST_OUTPUT_DIR
from tests.test_phase3_platform import _make_docx_bytes, _setup_published_flow_with_field


def _upload_and_map(client, dt_id, field_key, *, filename: str, placeholder: str):
    up = client.post(
        f"/api/platform/{dt_id}/templates",
        files={
            "file": (
                filename,
                _make_docx_bytes(placeholder),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert up.status_code == 201, up.text
    tmpl_id = up.json()["id"]
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
    return tmpl_id


def test_generate_explicit_template_id_uses_that_template(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    setup = _setup_published_flow_with_field(client_a, slug="two-tmpls")
    dt_id = setup["dt_id"]
    field_key = setup["field_key"]

    tmpl_a = _upload_and_map(
        client_a, dt_id, field_key, filename="a.docx", placeholder="token_a"
    )
    tmpl_b = _upload_and_map(
        client_a, dt_id, field_key, filename="b.docx", placeholder="token_b"
    )
    assert tmpl_a != tmpl_b

    gen = client_a.post(
        f"/api/platform/{dt_id}/generate",
        json={"template_id": tmpl_b, "fields": {field_key: "FromB"}},
    )
    assert gen.status_code == 201, gen.text
    doc_id = gen.json()["document_id"]

    db.expire_all()
    row = db.query(GeneratedDocument).filter(GeneratedDocument.id == doc_id).first()
    assert row is not None
    assert row.template_id == tmpl_b

    payload = json.loads(row.form_data_json or "{}")
    fill_data = payload.get("fill_data") or {}
    assert "token_b" in fill_data
    assert fill_data["token_b"] == "FromB"
    assert "token_a" not in fill_data

    # Output file should contain B's filled value (and not be empty)
    out_files = list(Path(TEST_OUTPUT_DIR).rglob(Path(row.docx_filename).name))
    assert out_files, row.docx_filename
    doc = Document(str(out_files[0]))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "FromB" in text


def test_generate_foreign_org_template_id_is_404(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    db = dual_org_clients["db"]

    setup_a = _setup_published_flow_with_field(client_a, slug="isol-a")
    setup_b = _setup_published_flow_with_field(client_b, slug="isol-b")

    tmpl_b = _upload_and_map(
        client_b,
        setup_b["dt_id"],
        setup_b["field_key"],
        filename="b-only.docx",
        placeholder="cand_name",
    )

    db.expire_all()
    docs_before = db.query(GeneratedDocument).filter_by(
        org_id=dual_org_clients["org_a"]["org"].id
    ).count()

    # Org A asks to generate under its own type, but with org B's template id
    resp = client_a.post(
        f"/api/platform/{setup_a['dt_id']}/generate",
        json={
            "template_id": tmpl_b,
            "fields": {setup_a["field_key"]: "Nope"},
        },
    )
    assert resp.status_code == 404

    db.expire_all()
    docs_after = db.query(GeneratedDocument).filter_by(
        org_id=dual_org_clients["org_a"]["org"].id
    ).count()
    assert docs_after == docs_before

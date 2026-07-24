"""Bulk FieldDefinitions from template placeholders (draft flow only)."""
from __future__ import annotations

import io

from docx import Document

from models import AuditLog, FieldDefinition, FlowStep


def _docx_bytes(*placeholder_ids: str) -> bytes:
    doc = Document()
    for pid in placeholder_ids:
        doc.add_paragraph(f"Hello {{{{{pid}}}}}")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_generate_fields_from_placeholders_creates_custom_fields_step(
    dual_org_clients,
):
    client = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    dt = client.post(
        "/api/platform/document-types/",
        json={"name": "Bulk Fields", "slug": "bulk-fields"},
    )
    assert dt.status_code == 201, dt.text
    dt_id = dt.json()["id"]

    flow = client.post(f"/api/platform/{dt_id}/flow", json={})
    assert flow.status_code == 201, flow.text
    flow_id = flow.json()["id"]
    # Draft with zero custom field steps / definitions

    upload = client.post(
        f"/api/platform/{dt_id}/templates",
        files={
            "file": (
                "bulk.docx",
                _docx_bytes("Company_Name", "Date", "Other_Thing"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert upload.status_code == 201, upload.text
    template_id = upload.json()["id"]

    gen = client.post(
        f"/api/platform/templates/{template_id}/generate-fields-from-placeholders"
    )
    assert gen.status_code == 200, gen.text
    body = gen.json()
    assert body["template_id"] == template_id
    assert body["flow_config_id"] == flow_id
    assert len(body["created"]) == 3
    assert body["skipped_placeholders"] == []

    by_key = {item["field_key"]: item["field_label"] for item in body["created"]}
    assert by_key["company_name"] == "Company Name"
    assert by_key["date"] == "Date"
    assert by_key["other_thing"] == "Other Thing"

    db.expire_all()
    step = (
        db.query(FlowStep)
        .filter(
            FlowStep.flow_config_id == flow_id,
            FlowStep.step_type == "custom_fields",
        )
        .one()
    )
    assert step.label == "Generated fields"
    assert body["flow_step_id"] == step.id

    fields = (
        db.query(FieldDefinition)
        .filter(FieldDefinition.flow_step_id == step.id)
        .order_by(FieldDefinition.id.asc())
        .all()
    )
    assert len(fields) == 3
    for fd in fields:
        assert fd.field_type == "text"
        assert fd.is_required is True

    audits = (
        db.query(AuditLog)
        .filter(AuditLog.action == "fields.bulk_generated_from_template")
        .all()
    )
    assert len(audits) == 1
    assert audits[0].target_type == "Template"
    assert audits[0].target_id == str(template_id)
    assert audits[0].metadata_json["created_count"] == 3

    # Idempotency: second call creates nothing
    again = client.post(
        f"/api/platform/templates/{template_id}/generate-fields-from-placeholders"
    )
    assert again.status_code == 200, again.text
    again_body = again.json()
    assert again_body["created"] == []
    assert set(again_body["skipped_placeholders"]) == {
        "Company_Name",
        "Date",
        "Other_Thing",
    }

    db.expire_all()
    assert (
        db.query(FieldDefinition)
        .filter(FieldDefinition.flow_step_id == step.id)
        .count()
        == 3
    )
    assert (
        db.query(AuditLog)
        .filter(AuditLog.action == "fields.bulk_generated_from_template")
        .count()
        == 2
    )


def test_generate_fields_requires_draft_flow(dual_org_clients):
    client = dual_org_clients["client_a"]

    dt = client.post(
        "/api/platform/document-types/",
        json={"name": "No Draft Gen", "slug": "no-draft-gen"},
    )
    assert dt.status_code == 201
    dt_id = dt.json()["id"]

    flow = client.post(f"/api/platform/{dt_id}/flow", json={})
    assert flow.status_code == 201
    flow_id = flow.json()["id"]
    pub = client.post(f"/api/platform/{flow_id}/publish")
    assert pub.status_code == 200

    upload = client.post(
        f"/api/platform/{dt_id}/templates",
        files={
            "file": (
                "x.docx",
                _docx_bytes("only_one"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert upload.status_code == 201
    template_id = upload.json()["id"]

    gen = client.post(
        f"/api/platform/templates/{template_id}/generate-fields-from-placeholders"
    )
    assert gen.status_code == 404
    assert "draft" in gen.json()["detail"].lower()


def test_generate_fields_cross_org_is_404(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]

    dt = client_a.post(
        "/api/platform/document-types/",
        json={"name": "XOrg Gen", "slug": "xorg-gen"},
    )
    assert dt.status_code == 201
    dt_id = dt.json()["id"]
    assert client_a.post(f"/api/platform/{dt_id}/flow", json={}).status_code == 201
    upload = client_a.post(
        f"/api/platform/{dt_id}/templates",
        files={
            "file": (
                "x.docx",
                _docx_bytes("a_key"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert upload.status_code == 201
    template_id = upload.json()["id"]

    blocked = client_b.post(
        f"/api/platform/templates/{template_id}/generate-fields-from-placeholders"
    )
    assert blocked.status_code == 404

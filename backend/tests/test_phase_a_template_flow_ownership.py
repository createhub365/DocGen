"""Phase A — per-template FlowConfig ownership (additive; doc-type flows unchanged)."""
from __future__ import annotations

import importlib.util
import io
import sys
from pathlib import Path

from docx import Document

from models import FieldDefinition, FlowConfig, FlowStep, PlaceholderMapping
from routers.platform_scope import (
    copy_flow_steps_and_fields,
    resolvable_field_keys_for_published_flow,
)


def _load_clone_module():
    path = (
        Path(__file__).resolve().parents[1] / "scripts" / "clone_flows_to_templates.py"
    )
    spec = importlib.util.spec_from_file_location("clone_flows_to_templates", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules["clone_flows_to_templates"] = mod
    spec.loader.exec_module(mod)
    return mod


_clone = _load_clone_module()
build_plans = _clone.build_plans
apply_plan = _clone.apply_plan


def _docx_bytes(*placeholder_ids: str) -> bytes:
    doc = Document()
    for pid in placeholder_ids:
        doc.add_paragraph(f"Hello {{{{{pid}}}}}")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _upload_template(client, dt_id: int, name: str = "t.docx") -> int:
    upload = client.post(
        f"/api/platform/{dt_id}/templates",
        files={
            "file": (
                name,
                _docx_bytes("Company_Name", "Employee_Name"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert upload.status_code == 201, upload.text
    return upload.json()["id"]


def _publish_shared_flow_with_fields(client, slug: str = "shared-flow"):
    dt = client.post(
        "/api/platform/document-types/",
        json={"name": f"DT {slug}", "slug": slug},
    )
    assert dt.status_code == 201, dt.text
    dt_id = dt.json()["id"]

    flow = client.post(f"/api/platform/{dt_id}/flow", json={})
    assert flow.status_code == 201, flow.text
    flow_id = flow.json()["id"]

    step = client.post(
        f"/api/platform/{flow_id}/steps",
        json={
            "step_type": "custom_fields",
            "order_index": 0,
            "label": "Fields",
            "is_enabled": True,
        },
    )
    assert step.status_code == 201, step.text
    step_id = step.json()["id"]

    for key, label in (
        ("company_name", "Company Name"),
        ("employee_name", "Employee Name"),
    ):
        fd = client.post(
            f"/api/platform/steps/{step_id}/fields",
            json={
                "field_key": key,
                "field_label": label,
                "field_type": "text",
                "is_required": True,
            },
        )
        assert fd.status_code == 201, fd.text

    assert client.post(f"/api/platform/{flow_id}/publish").status_code == 200
    return {"dt_id": dt_id, "flow_id": flow_id, "step_id": step_id}


def test_clone_script_idempotent_and_preserves_source(dual_org_clients):
    client = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    setup = _publish_shared_flow_with_fields(client, slug="clone-idem")
    t1 = _upload_template(client, setup["dt_id"], "a.docx")
    t2 = _upload_template(client, setup["dt_id"], "b.docx")

    source_before = db.query(FlowConfig).filter(FlowConfig.id == setup["flow_id"]).one()
    assert source_before.document_type_id == setup["dt_id"]
    assert source_before.template_id is None
    assert source_before.is_published is True
    source_keys = resolvable_field_keys_for_published_flow(db, source_before)
    source_step_count = (
        db.query(FlowStep)
        .filter(FlowStep.flow_config_id == setup["flow_id"])
        .count()
    )

    plans = build_plans(db, document_type_id=setup["dt_id"])
    assert len(plans) == 1
    assert {t.template_id for t in plans[0].templates} == {t1, t2}
    assert all(t.action == "clone" for t in plans[0].templates)

    for plan in plans:
        apply_plan(db, plan, dry_run=False)
    db.commit()
    db.expire_all()

    # Original untouched
    source_after = db.query(FlowConfig).filter(FlowConfig.id == setup["flow_id"]).one()
    assert source_after.document_type_id == setup["dt_id"]
    assert source_after.template_id is None
    assert source_after.is_published is True
    assert (
        db.query(FlowStep)
        .filter(FlowStep.flow_config_id == setup["flow_id"])
        .count()
        == source_step_count
    )

    for tid in (t1, t2):
        cloned = (
            db.query(FlowConfig)
            .filter(
                FlowConfig.template_id == tid,
                FlowConfig.is_published.is_(True),
            )
            .one()
        )
        assert cloned.document_type_id is None
        assert cloned.version == 1
        assert resolvable_field_keys_for_published_flow(db, cloned) == source_keys
        assert cloned.id != setup["flow_id"]

    # Idempotent re-run: no new rows
    before_count = db.query(FlowConfig).filter(FlowConfig.template_id.isnot(None)).count()
    plans2 = build_plans(db, document_type_id=setup["dt_id"])
    assert all(t.action == "skip_existing" for t in plans2[0].templates)
    for plan in plans2:
        apply_plan(db, plan, dry_run=False)
    db.commit()
    db.expire_all()
    after_count = db.query(FlowConfig).filter(FlowConfig.template_id.isnot(None)).count()
    assert after_count == before_count == 2


def test_clone_preserves_field_keys_for_placeholder_mappings(dual_org_clients):
    """Critical safety: mappings resolve by field_key against the cloned flow."""
    client = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    setup = _publish_shared_flow_with_fields(client, slug="clone-map")
    tid = _upload_template(client, setup["dt_id"], "map.docx")

    # Existing mappings (as created under shared doc-type flow era)
    db.add(
        PlaceholderMapping(
            template_id=tid,
            placeholder_key="Company_Name",
            field_key="company_name",
            is_mapped=True,
        )
    )
    db.add(
        PlaceholderMapping(
            template_id=tid,
            placeholder_key="Employee_Name",
            field_key="employee_name",
            is_mapped=True,
        )
    )
    db.commit()

    plans = build_plans(db, document_type_id=setup["dt_id"])
    for plan in plans:
        apply_plan(db, plan, dry_run=False)
    db.commit()
    db.expire_all()

    cloned = (
        db.query(FlowConfig)
        .filter(FlowConfig.template_id == tid, FlowConfig.is_published.is_(True))
        .one()
    )
    resolvable = resolvable_field_keys_for_published_flow(db, cloned)
    mappings = (
        db.query(PlaceholderMapping)
        .filter(PlaceholderMapping.template_id == tid)
        .all()
    )
    assert len(mappings) == 2
    for m in mappings:
        assert m.field_key in resolvable

    # Mapping rows themselves were not rewritten
    assert {m.field_key for m in mappings} == {"company_name", "employee_name"}


def test_template_flow_crud_publish_and_cross_org(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    db = dual_org_clients["db"]

    # Template under org A (shared flow optional — start empty for new endpoint)
    dt = client_a.post(
        "/api/platform/document-types/",
        json={"name": "Tpl Flow", "slug": "tpl-flow"},
    ).json()
    tid = _upload_template(client_a, dt["id"], "tpl.docx")

    # 404 until created
    assert (
        client_a.get(f"/api/platform/templates/{tid}/flow/published").status_code
        == 404
    )
    assert (
        client_a.get(f"/api/platform/templates/{tid}/flow/draft").status_code == 404
    )

    created = client_a.post(f"/api/platform/templates/{tid}/flow", json={})
    assert created.status_code == 201, created.text
    flow = created.json()
    assert flow["template_id"] == tid
    assert flow["document_type_id"] is None
    assert flow["is_published"] is False
    flow_id = flow["id"]

    draft = client_a.get(f"/api/platform/templates/{tid}/flow/draft")
    assert draft.status_code == 200
    assert draft.json()["id"] == flow_id

    step = client_a.post(
        f"/api/platform/{flow_id}/steps",
        json={
            "step_type": "custom_fields",
            "order_index": 0,
            "label": "T Fields",
            "is_enabled": True,
        },
    )
    assert step.status_code == 201, step.text
    step_id = step.json()["id"]

    fd = client_a.post(
        f"/api/platform/steps/{step_id}/fields",
        json={
            "field_key": "company_name",
            "field_label": "Company",
            "field_type": "text",
            "is_required": True,
        },
    )
    assert fd.status_code == 201, fd.text

    pub = client_a.post(f"/api/platform/{flow_id}/publish")
    assert pub.status_code == 200, pub.text
    assert pub.json()["is_published"] is True

    published = client_a.get(f"/api/platform/templates/{tid}/flow/published")
    assert published.status_code == 200
    assert published.json()["id"] == flow_id

    # new-draft deep-copies with same field_keys
    draft2 = client_a.post(f"/api/platform/templates/{tid}/flow/new-draft")
    assert draft2.status_code == 201, draft2.text
    assert draft2.json()["is_published"] is False
    assert draft2.json()["id"] != flow_id
    db.expire_all()
    draft_row = db.query(FlowConfig).filter(FlowConfig.id == draft2.json()["id"]).one()
    pub_row = db.query(FlowConfig).filter(FlowConfig.id == flow_id).one()
    assert resolvable_field_keys_for_published_flow(
        db, draft_row
    ) == resolvable_field_keys_for_published_flow(db, pub_row)

    history = client_a.get(f"/api/platform/templates/{tid}/flow/history")
    assert history.status_code == 200
    assert len(history.json()) == 2

    # Cross-org isolation
    assert (
        client_b.get(f"/api/platform/templates/{tid}/flow/published").status_code
        == 404
    )
    assert (
        client_b.post(f"/api/platform/templates/{tid}/flow", json={}).status_code
        == 404
    )
    assert client_b.post(f"/api/platform/{flow_id}/publish").status_code == 404
    assert (
        client_b.post(f"/api/platform/templates/{tid}/flow/new-draft").status_code
        == 404
    )


def test_doc_type_flow_endpoints_still_work_alongside_template_flows(dual_org_clients):
    """Additive phase: old document-type routes unchanged while template flows exist."""
    client = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    setup = _publish_shared_flow_with_fields(client, slug="legacy-ok")
    tid = _upload_template(client, setup["dt_id"], "legacy.docx")

    plans = build_plans(db, document_type_id=setup["dt_id"])
    for plan in plans:
        apply_plan(db, plan, dry_run=False)
    db.commit()

    # Doc-type published still returns the ORIGINAL shared flow
    pub = client.get(f"/api/platform/{setup['dt_id']}/flow/published")
    assert pub.status_code == 200
    assert pub.json()["id"] == setup["flow_id"]
    assert pub.json()["document_type_id"] == setup["dt_id"]
    assert pub.json()["template_id"] is None

    # Template published returns the clone
    tpub = client.get(f"/api/platform/templates/{tid}/flow/published")
    assert tpub.status_code == 200
    assert tpub.json()["template_id"] == tid
    assert tpub.json()["id"] != setup["flow_id"]

    hist = client.get(f"/api/platform/{setup['dt_id']}/flow/history")
    assert hist.status_code == 200
    assert any(h["id"] == setup["flow_id"] for h in hist.json())


def test_copy_flow_steps_and_fields_preserves_keys(dual_org_clients):
    client = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    setup = _publish_shared_flow_with_fields(client, slug="copy-keys")
    source = db.query(FlowConfig).filter(FlowConfig.id == setup["flow_id"]).one()
    keys = resolvable_field_keys_for_published_flow(db, source)

    tid = _upload_template(client, setup["dt_id"], "copy.docx")
    dest = FlowConfig(
        document_type_id=None,
        template_id=tid,
        version=99,
        is_published=False,
    )
    db.add(dest)
    db.flush()
    n = copy_flow_steps_and_fields(db, source_flow_id=source.id, dest_flow=dest)
    db.commit()
    db.expire_all()
    assert n == 2
    assert resolvable_field_keys_for_published_flow(db, dest) == keys

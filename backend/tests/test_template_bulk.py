"""Bulk template delete/move — partial success, staff 403, reuses single-item helpers."""
from __future__ import annotations

from models import AuditLog, GeneratedDocument, PlaceholderMapping, Template
from tests.test_phase3_platform import _setup_published_flow_with_field
from tests.test_phase12_option_lists import _staff_client
from tests.test_template_delete import _map_complete
from tests.test_template_display_name import _upload


def test_bulk_delete_all_valid_clears_mappings_and_sets_null(dual_org_clients):
    client = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    setup = _setup_published_flow_with_field(client, slug="bulk-del-ok")
    dt_id = setup["dt_id"]

    ids = []
    gen_ids = []
    for i in range(3):
        up = _upload(
            client,
            dt_id,
            filename=f"bulk{i}.docx",
            display_name=f"Bulk {i}",
            placeholder="cand_name",
        )
        assert up.status_code == 201, up.text
        tid = up.json()["id"]
        ids.append(tid)
        _map_complete(client, tid, setup["field_key"])
        gen = client.post(
            f"/api/platform/{dt_id}/generate",
            json={"template_id": tid, "fields": {setup["field_key"]: f"Name{i}"}},
        )
        assert gen.status_code == 201, gen.text
        gen_ids.append(gen.json()["document_id"])

    resp = client.post(
        f"/api/platform/{dt_id}/templates/bulk-delete",
        json={"template_ids": ids},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert sorted(body["succeeded"]) == sorted(ids)
    assert body["failed"] == []

    db.expire_all()
    for tid in ids:
        assert db.query(Template).filter(Template.id == tid).first() is None
        assert (
            db.query(PlaceholderMapping)
            .filter(PlaceholderMapping.template_id == tid)
            .count()
            == 0
        )
    for gid in gen_ids:
        row = db.query(GeneratedDocument).filter(GeneratedDocument.id == gid).first()
        assert row is not None
        assert row.template_id is None

    audit = (
        db.query(AuditLog)
        .filter(AuditLog.action == "templates.bulk_deleted")
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert audit is not None
    assert audit.metadata_json.get("succeeded") == 3
    assert audit.metadata_json.get("failed") == 0


def test_bulk_delete_partial_cross_org(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    db = dual_org_clients["db"]

    setup_a = _setup_published_flow_with_field(client_a, slug="bulk-del-a")
    setup_b = _setup_published_flow_with_field(client_b, slug="bulk-del-b")

    valid_ids = []
    for i in range(2):
        up = _upload(client_a, setup_a["dt_id"], filename=f"va{i}.docx")
        assert up.status_code == 201
        valid_ids.append(up.json()["id"])

    up_b = _upload(client_b, setup_b["dt_id"], filename="cross.docx")
    assert up_b.status_code == 201
    cross_id = up_b.json()["id"]

    resp = client_a.post(
        f"/api/platform/{setup_a['dt_id']}/templates/bulk-delete",
        json={"template_ids": valid_ids + [cross_id]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert sorted(body["succeeded"]) == sorted(valid_ids)
    assert len(body["failed"]) == 1
    assert body["failed"][0]["id"] == cross_id
    assert "Not found" in body["failed"][0]["reason"]

    db.expire_all()
    for tid in valid_ids:
        assert db.query(Template).filter(Template.id == tid).first() is None
    assert db.query(Template).filter(Template.id == cross_id).first() is not None


def test_bulk_move_all_valid(dual_org_clients):
    client = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    setup = _setup_published_flow_with_field(client, slug="bulk-mv-ok")
    dt_id = setup["dt_id"]

    folder = client.post(f"/api/platform/{dt_id}/folders", json={"name": "Target"})
    assert folder.status_code == 201, folder.text
    folder_id = folder.json()["id"]

    ids = []
    for i in range(3):
        up = _upload(client, dt_id, filename=f"mv{i}.docx")
        assert up.status_code == 201
        ids.append(up.json()["id"])

    resp = client.post(
        f"/api/platform/{dt_id}/templates/bulk-move",
        json={"template_ids": ids, "folder_id": folder_id},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert sorted(body["succeeded"]) == sorted(ids)
    assert body["failed"] == []

    db.expire_all()
    for tid in ids:
        row = db.query(Template).filter(Template.id == tid).first()
        assert row is not None
        assert row.folder_id == folder_id

    audit = (
        db.query(AuditLog)
        .filter(AuditLog.action == "templates.bulk_moved")
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert audit is not None
    assert audit.metadata_json.get("succeeded") == 3
    assert audit.metadata_json.get("folder_id") == folder_id


def test_bulk_move_invalid_folder_request_404(dual_org_clients):
    """Shared target folder from another document type → 404 (request-level)."""
    client = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    setup_a = _setup_published_flow_with_field(client, slug="bulk-mv-a")
    setup_b = _setup_published_flow_with_field(client, slug="bulk-mv-b")

    folder_b = client.post(
        f"/api/platform/{setup_b['dt_id']}/folders", json={"name": "Other DT"}
    )
    assert folder_b.status_code == 201
    bad_folder_id = folder_b.json()["id"]

    ids = []
    for i in range(2):
        up = _upload(client, setup_a["dt_id"], filename=f"stay{i}.docx")
        assert up.status_code == 201
        ids.append(up.json()["id"])

    resp = client.post(
        f"/api/platform/{setup_a['dt_id']}/templates/bulk-move",
        json={"template_ids": ids, "folder_id": bad_folder_id},
    )
    assert resp.status_code == 404, resp.text

    db.expire_all()
    for tid in ids:
        row = db.query(Template).filter(Template.id == tid).first()
        assert row is not None
        assert row.folder_id is None


def test_bulk_move_partial_bad_template_id(dual_org_clients):
    """Valid templates move; foreign/missing id reported in failed (independent)."""
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    db = dual_org_clients["db"]
    setup_a = _setup_published_flow_with_field(client_a, slug="bulk-mv-part")
    setup_b = _setup_published_flow_with_field(client_b, slug="bulk-mv-part-b")
    dt_id = setup_a["dt_id"]

    folder = client_a.post(f"/api/platform/{dt_id}/folders", json={"name": "Inbox"})
    folder_id = folder.json()["id"]

    up1 = _upload(client_a, dt_id, filename="ok1.docx")
    up2 = _upload(client_a, dt_id, filename="ok2.docx")
    up_b = _upload(client_b, setup_b["dt_id"], filename="foreign.docx")
    id1, id2, foreign = up1.json()["id"], up2.json()["id"], up_b.json()["id"]

    resp = client_a.post(
        f"/api/platform/{dt_id}/templates/bulk-move",
        json={"template_ids": [id1, foreign, id2], "folder_id": folder_id},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert sorted(body["succeeded"]) == sorted([id1, id2])
    assert len(body["failed"]) == 1
    assert body["failed"][0]["id"] == foreign

    db.expire_all()
    assert db.query(Template).filter(Template.id == id1).first().folder_id == folder_id
    assert db.query(Template).filter(Template.id == id2).first().folder_id == folder_id
    assert db.query(Template).filter(Template.id == foreign).first().folder_id is None


def test_staff_bulk_endpoints_forbidden(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    setup = _setup_published_flow_with_field(client_a, slug="bulk-staff")
    dt_id = setup["dt_id"]
    up = _upload(client_a, dt_id, filename="staff.docx")
    tid = up.json()["id"]
    folder = client_a.post(f"/api/platform/{dt_id}/folders", json={"name": "F"})
    folder_id = folder.json()["id"]

    staff = _staff_client(dual_org_clients, email="staff.bulk@example.com")
    assert (
        staff.post(
            f"/api/platform/{dt_id}/templates/bulk-delete",
            json={"template_ids": [tid]},
        ).status_code
        == 403
    )
    assert (
        staff.post(
            f"/api/platform/{dt_id}/templates/bulk-move",
            json={"template_ids": [tid], "folder_id": folder_id},
        ).status_code
        == 403
    )

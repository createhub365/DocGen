"""Template folders — CRUD, move, delete SET NULL, staff + cross-org gates."""
from __future__ import annotations

from models import Template, TemplateFolder
from tests.test_phase3_platform import _make_docx_bytes, _setup_published_flow_with_field
from tests.test_phase12_option_lists import _staff_client


def _upload(client, dt_id, *, filename="doc.docx", placeholder="cand_name", folder_id=None):
    data = {}
    if folder_id is not None:
        data["folder_id"] = str(folder_id)
    files = {
        "file": (
            filename,
            _make_docx_bytes(placeholder),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    }
    return client.post(
        f"/api/platform/{dt_id}/templates",
        files=files,
        data=data or None,
    )


def test_create_folder_duplicate_name_409(dual_org_clients):
    client = dual_org_clients["client_a"]
    setup = _setup_published_flow_with_field(client, slug="fold-dup")
    dt_id = setup["dt_id"]

    r1 = client.post(f"/api/platform/{dt_id}/folders", json={"name": "Canada"})
    assert r1.status_code == 201, r1.text
    r2 = client.post(f"/api/platform/{dt_id}/folders", json={"name": "Canada"})
    assert r2.status_code == 409, r2.text


def test_upload_and_move_into_folder(dual_org_clients):
    client = dual_org_clients["client_a"]
    setup = _setup_published_flow_with_field(client, slug="fold-move")
    dt_id = setup["dt_id"]

    folder = client.post(f"/api/platform/{dt_id}/folders", json={"name": "New Zealand"})
    assert folder.status_code == 201, folder.text
    folder_id = folder.json()["id"]

    up = _upload(client, dt_id, filename="nz.docx", folder_id=folder_id)
    assert up.status_code == 201, up.text
    assert up.json()["folder_id"] == folder_id
    tmpl_id = up.json()["id"]

    listed = client.get(f"/api/platform/{dt_id}/templates").json()
    match = next(r for r in listed if r["id"] == tmpl_id)
    assert match["folder_id"] == folder_id

    # Move to uncategorized
    moved = client.patch(f"/api/platform/templates/{tmpl_id}", json={"folder_id": None})
    assert moved.status_code == 200, moved.text
    assert moved.json()["folder_id"] is None

    listed2 = client.get(f"/api/platform/{dt_id}/templates").json()
    match2 = next(r for r in listed2 if r["id"] == tmpl_id)
    assert match2["folder_id"] is None


def test_delete_folder_uncategorizes_templates(dual_org_clients):
    client = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    setup = _setup_published_flow_with_field(client, slug="fold-del")
    dt_id = setup["dt_id"]

    folder = client.post(f"/api/platform/{dt_id}/folders", json={"name": "Temp"})
    folder_id = folder.json()["id"]
    up = _upload(client, dt_id, folder_id=folder_id)
    tmpl_id = up.json()["id"]

    deleted = client.delete(f"/api/platform/folders/{folder_id}")
    assert deleted.status_code == 200, deleted.text

    db.expire_all()
    assert db.query(TemplateFolder).filter(TemplateFolder.id == folder_id).first() is None
    row = db.query(Template).filter(Template.id == tmpl_id).first()
    assert row is not None
    assert row.is_active is True
    assert row.folder_id is None


def test_cross_org_folder_isolation(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    setup_a = _setup_published_flow_with_field(client_a, slug="fold-a")
    setup_b = _setup_published_flow_with_field(client_b, slug="fold-b")

    folder_a = client_a.post(
        f"/api/platform/{setup_a['dt_id']}/folders", json={"name": "Secret"}
    )
    assert folder_a.status_code == 201
    folder_id = folder_a.json()["id"]

    # Org B cannot rename/delete org A's folder
    assert (
        client_b.patch(
            f"/api/platform/folders/{folder_id}", json={"name": "Hacked"}
        ).status_code
        == 404
    )
    assert client_b.delete(f"/api/platform/folders/{folder_id}").status_code == 404

    # Org B cannot create a folder under org A's document type
    assert (
        client_b.post(
            f"/api/platform/{setup_a['dt_id']}/folders", json={"name": "Nope"}
        ).status_code
        == 404
    )

    # Org B cannot move its template into org A's folder
    up_b = _upload(client_b, setup_b["dt_id"], filename="b.docx")
    assert up_b.status_code == 201
    tmpl_b = up_b.json()["id"]
    moved = client_b.patch(
        f"/api/platform/templates/{tmpl_b}", json={"folder_id": folder_id}
    )
    assert moved.status_code == 404, moved.text


def test_staff_folder_read_only(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    setup = _setup_published_flow_with_field(client_a, slug="fold-staff")
    dt_id = setup["dt_id"]

    folder = client_a.post(f"/api/platform/{dt_id}/folders", json={"name": "Visible"})
    assert folder.status_code == 201
    folder_id = folder.json()["id"]
    up = _upload(client_a, dt_id, folder_id=folder_id)
    tmpl_id = up.json()["id"]

    staff = _staff_client(dual_org_clients, email="staff.folders@example.com")

    listed = staff.get(f"/api/platform/{dt_id}/folders")
    assert listed.status_code == 200, listed.text
    assert any(f["id"] == folder_id for f in listed.json())

    templates = staff.get(f"/api/platform/{dt_id}/templates")
    assert templates.status_code == 200

    assert (
        staff.post(f"/api/platform/{dt_id}/folders", json={"name": "Nope"}).status_code
        == 403
    )
    assert (
        staff.patch(
            f"/api/platform/folders/{folder_id}", json={"name": "Renamed"}
        ).status_code
        == 403
    )
    assert staff.delete(f"/api/platform/folders/{folder_id}").status_code == 403
    assert (
        staff.patch(
            f"/api/platform/templates/{tmpl_id}", json={"folder_id": None}
        ).status_code
        == 403
    )

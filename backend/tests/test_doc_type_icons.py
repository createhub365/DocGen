"""Org document type icon field (create / default / update / isolation)."""
from __future__ import annotations

from models import OrgDocumentType
from schemas_platform import DEFAULT_DOC_TYPE_ICON


def _create_type(client, *, name, slug, icon=None, description=None):
    payload = {"name": name, "slug": slug}
    if icon is not None:
        payload["icon"] = icon
    if description is not None:
        payload["description"] = description
    return client.post("/api/platform/document-types/", json=payload)


def test_create_with_icon_stored_and_returned(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    resp = _create_type(client_a, name="Offer Letter", slug="offer-icon", icon="file-word")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["icon"] == "file-word"

    db.expire_all()
    row = db.query(OrgDocumentType).filter(OrgDocumentType.id == body["id"]).first()
    assert row.icon == "file-word"

    listed = client_a.get("/api/platform/document-types/").json()
    match = next(r for r in listed if r["id"] == body["id"])
    assert match["icon"] == "file-word"


def test_create_without_icon_uses_default(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    resp = _create_type(client_a, name="Generic", slug="generic-default")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["icon"] == DEFAULT_DOC_TYPE_ICON

    # Invalid icon also falls back to default
    bad = _create_type(
        client_a, name="Bad Icon", slug="bad-icon", icon="not-a-real-icon"
    )
    assert bad.status_code == 201, bad.text
    assert bad.json()["icon"] == DEFAULT_DOC_TYPE_ICON

    db.expire_all()
    row = db.query(OrgDocumentType).filter(OrgDocumentType.id == body["id"]).first()
    assert row.icon == DEFAULT_DOC_TYPE_ICON


def test_update_icon_persists(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    created = _create_type(client_a, name="Editable", slug="edit-icon", icon="form")
    assert created.status_code == 201
    tid = created.json()["id"]

    patched = client_a.patch(
        f"/api/platform/document-types/{tid}",
        json={"icon": "bank"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["icon"] == "bank"

    db.expire_all()
    row = db.query(OrgDocumentType).filter(OrgDocumentType.id == tid).first()
    assert row.icon == "bank"

    got = client_a.get(f"/api/platform/document-types/{tid}")
    assert got.status_code == 200
    assert got.json()["icon"] == "bank"


def test_icon_null_in_db_reads_as_default(dual_org_clients):
    """Backward compat: pre-migration rows with NULL icon → API returns default."""
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    created = _create_type(client_a, name="Legacy Null", slug="legacy-null")
    tid = created.json()["id"]

    db.expire_all()
    row = db.query(OrgDocumentType).filter(OrgDocumentType.id == tid).first()
    row.icon = None
    db.commit()

    got = client_a.get(f"/api/platform/document-types/{tid}")
    assert got.status_code == 200
    assert got.json()["icon"] == DEFAULT_DOC_TYPE_ICON


def test_cross_org_cannot_update_other_org_icon(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    db = dual_org_clients["db"]

    created = _create_type(client_a, name="A Only", slug="a-only-icon", icon="team")
    tid = created.json()["id"]

    blocked = client_b.patch(
        f"/api/platform/document-types/{tid}",
        json={"icon": "global"},
    )
    assert blocked.status_code == 404

    db.expire_all()
    row = db.query(OrgDocumentType).filter(OrgDocumentType.id == tid).first()
    assert row.icon == "team"

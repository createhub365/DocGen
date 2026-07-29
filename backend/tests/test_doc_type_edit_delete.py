"""Document type edit + soft-delete safety for historical generated docs."""
from __future__ import annotations

from models import OrgDocumentType
from tests.test_phase3_platform import _setup_published_flow_with_field
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


def test_patch_updates_name_description_icon_not_slug(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    created = client_a.post(
        "/api/platform/document-types/",
        json={
            "name": "Original Name",
            "slug": "stable-slug",
            "description": "Before",
            "icon": "form",
        },
    )
    assert created.status_code == 201, created.text
    tid = created.json()["id"]
    assert created.json()["slug"] == "stable-slug"

    patched = client_a.patch(
        f"/api/platform/document-types/{tid}",
        json={
            "name": "Renamed Type",
            "description": "After",
            "icon": "bank",
        },
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["name"] == "Renamed Type"
    assert body["description"] == "After"
    assert body["icon"] == "bank"
    assert body["slug"] == "stable-slug"

    db.expire_all()
    row = db.query(OrgDocumentType).filter(OrgDocumentType.id == tid).first()
    assert row.name == "Renamed Type"
    assert row.slug == "stable-slug"
    assert row.icon == "bank"


def test_soft_delete_frees_slug_for_reuse(dual_org_clients):
    """Soft-deleted types must not block recreating the same slug (option a)."""
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    created = client_a.post(
        "/api/platform/document-types/",
        json={"name": "Reusable", "slug": "reusable-slug"},
    )
    assert created.status_code == 201, created.text
    tid = created.json()["id"]

    deleted = client_a.delete(f"/api/platform/document-types/{tid}")
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["is_active"] is False

    recreated = client_a.post(
        "/api/platform/document-types/",
        json={"name": "Reusable Again", "slug": "reusable-slug"},
    )
    assert recreated.status_code == 201, recreated.text
    assert recreated.json()["slug"] == "reusable-slug"
    assert recreated.json()["id"] != tid
    assert recreated.json()["is_active"] is True

    db.expire_all()
    inactive = db.query(OrgDocumentType).filter(OrgDocumentType.id == tid).first()
    active = (
        db.query(OrgDocumentType)
        .filter(OrgDocumentType.id == recreated.json()["id"])
        .first()
    )
    assert inactive.is_active is False
    assert inactive.slug == "reusable-slug"
    assert active.is_active is True
    assert active.slug == "reusable-slug"


def test_active_duplicate_slug_still_409(dual_org_clients):
    client_a = dual_org_clients["client_a"]

    first = client_a.post(
        "/api/platform/document-types/",
        json={"name": "Alpha", "slug": "dup-slug"},
    )
    assert first.status_code == 201, first.text

    second = client_a.post(
        "/api/platform/document-types/",
        json={"name": "Alpha Copy", "slug": "dup-slug"},
    )
    assert second.status_code == 409, second.text
    detail = second.json().get("detail", "")
    assert "already exists" in detail.lower()


def test_soft_delete_hides_from_list_and_cross_org_blocked(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    db = dual_org_clients["db"]

    created = client_a.post(
        "/api/platform/document-types/",
        json={"name": "To Archive", "slug": "to-archive"},
    )
    assert created.status_code == 201
    tid = created.json()["id"]

    blocked_patch = client_b.patch(
        f"/api/platform/document-types/{tid}",
        json={"name": "Hijack"},
    )
    assert blocked_patch.status_code == 404

    blocked_del = client_b.delete(f"/api/platform/document-types/{tid}")
    assert blocked_del.status_code == 404

    deleted = client_a.delete(f"/api/platform/document-types/{tid}")
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["is_active"] is False

    listed = client_a.get("/api/platform/document-types/").json()
    assert all(row["id"] != tid for row in listed)

    get_gone = client_a.get(f"/api/platform/document-types/{tid}")
    assert get_gone.status_code == 404

    db.expire_all()
    row = db.query(OrgDocumentType).filter(OrgDocumentType.id == tid).first()
    assert row is not None
    assert row.is_active is False


def test_soft_delete_keeps_generated_docs_listable_and_downloadable(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    setup = _setup_published_flow_with_field(client_a, slug="del-keep-gen")

    up = _upload(
        client_a,
        setup["dt_id"],
        filename="keep.docx",
        display_name="Keep Gen",
        placeholder="cand_name",
    )
    assert up.status_code == 201, up.text
    tmpl_id = up.json()["id"]
    _map_complete(client_a, tmpl_id, setup["field_key"])

    gen = client_a.post(
        f"/api/platform/{setup['dt_id']}/generate",
        json={"fields": {setup["field_key"]: "Ada Lovelace"}},
    )
    assert gen.status_code == 201, gen.text
    doc_id = gen.json()["document_id"]

    before = client_a.get("/api/platform/generated").json()
    assert any(row["id"] == doc_id for row in before)

    dl_before = client_a.get(f"/api/platform/generated/{doc_id}/download")
    assert dl_before.status_code == 200, dl_before.text
    assert len(dl_before.content) > 0

    deleted = client_a.delete(f"/api/platform/document-types/{setup['dt_id']}")
    assert deleted.status_code == 200, deleted.text

    # Type gone from active list
    listed = client_a.get("/api/platform/document-types/").json()
    assert all(row["id"] != setup["dt_id"] for row in listed)

    # Historical generated doc still listed + downloadable
    after = client_a.get("/api/platform/generated").json()
    match = next(row for row in after if row["id"] == doc_id)
    assert match["docx_filename"]
    # Name may still resolve via outerjoin (type row still exists, just inactive)
    assert match.get("document_type_name")

    dl_after = client_a.get(f"/api/platform/generated/{doc_id}/download")
    assert dl_after.status_code == 200, dl_after.text
    assert len(dl_after.content) > 0
    assert dl_after.content == dl_before.content

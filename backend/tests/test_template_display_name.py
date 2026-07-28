"""Platform template display_name on upload / list / rename."""
from __future__ import annotations

from models import Template
from tests.test_phase3_platform import _make_docx_bytes, _setup_published_flow_with_field


def _upload(client, dt_id, *, filename="t.docx", display_name=None, placeholder="cand_name"):
    files = {
        "file": (
            filename,
            _make_docx_bytes(placeholder),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    }
    data = None
    if display_name is not None:
        data = {"display_name": display_name}
    return client.post(f"/api/platform/{dt_id}/templates", files=files, data=data)


def test_upload_with_display_name_returned(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    setup = _setup_published_flow_with_field(client_a, slug="disp-named")

    up = _upload(
        client_a,
        setup["dt_id"],
        filename="raw_offer.docx",
        display_name="Standard Offer Letter",
    )
    assert up.status_code == 201, up.text
    body = up.json()
    assert body["display_name"] == "Standard Offer Letter"
    assert "raw_offer" not in body["display_name"] or body["display_name"] == "Standard Offer Letter"

    listed = client_a.get(f"/api/platform/{setup['dt_id']}/templates").json()
    match = next(r for r in listed if r["id"] == body["id"])
    assert match["display_name"] == "Standard Offer Letter"
    assert match["docx_filename"].endswith(".docx")


def test_upload_without_display_name_falls_back_to_filename(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    setup = _setup_published_flow_with_field(client_a, slug="disp-fallback")

    up = _upload(client_a, setup["dt_id"], filename="offer_letter_v2.docx")
    assert up.status_code == 201, up.text
    body = up.json()
    assert body["display_name"] == "offer_letter_v2.docx"

    listed = client_a.get(f"/api/platform/{setup['dt_id']}/templates").json()
    match = next(r for r in listed if r["id"] == body["id"])
    assert match["display_name"] == "offer_letter_v2.docx"


def test_rename_display_name_and_cross_org_blocked(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    db = dual_org_clients["db"]

    setup = _setup_published_flow_with_field(client_a, slug="disp-rename")
    up = _upload(
        client_a,
        setup["dt_id"],
        filename="a.docx",
        display_name="Original Name",
    )
    assert up.status_code == 201, up.text
    tmpl_id = up.json()["id"]

    renamed = client_a.patch(
        f"/api/platform/templates/{tmpl_id}",
        json={"display_name": "Renamed Letter"},
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["display_name"] == "Renamed Letter"

    db.expire_all()
    row = db.query(Template).filter(Template.id == tmpl_id).first()
    assert row is not None
    assert row.display_name == "Renamed Letter"

    listed = client_a.get(f"/api/platform/{setup['dt_id']}/templates").json()
    assert next(r for r in listed if r["id"] == tmpl_id)["display_name"] == "Renamed Letter"

    blocked = client_b.patch(
        f"/api/platform/templates/{tmpl_id}",
        json={"display_name": "Hacked"},
    )
    assert blocked.status_code == 404

    db.expire_all()
    row = db.query(Template).filter(Template.id == tmpl_id).first()
    assert row.display_name == "Renamed Letter"


def test_list_null_display_name_falls_back_to_basename(dual_org_clients):
    """Existing/null rows (pre-migration style) resolve via filename basename."""
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    setup = _setup_published_flow_with_field(client_a, slug="disp-null")

    up = _upload(client_a, setup["dt_id"], filename="legacy_style.docx")
    assert up.status_code == 201, up.text
    tmpl_id = up.json()["id"]

    db.expire_all()
    row = db.query(Template).filter(Template.id == tmpl_id).first()
    row.display_name = None
    db.commit()

    listed = client_a.get(f"/api/platform/{setup['dt_id']}/templates").json()
    match = next(r for r in listed if r["id"] == tmpl_id)
    # Stored path is orgs/.../unique.docx — basename of that path
    assert match["display_name"] == match["docx_filename"].rsplit("/", 1)[-1]

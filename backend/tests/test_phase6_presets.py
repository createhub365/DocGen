"""Phase 6 — immigration starter kit presets (structure-only install)."""
from __future__ import annotations

from sqlalchemy import inspect as sa_inspect

from models import (
    FieldDefinition,
    FlowConfig,
    FlowStep,
    OrgDocumentType,
)


_LEGACY_TABLES = frozenset(
    {"countries", "trades", "companies", "document_types", "employers"}
)
_FORBIDDEN_COLUMN_FRAGMENTS = (
    "country_id",
    "trade_id",
    "company_id",
    "employer_id",
    # legacy DocumentType PK — platform uses document_type_id → org_document_types only
)


def test_install_immigration_starter_creates_draft_flows(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    org_a = dual_org_clients["org_a"]

    catalog = client_a.get("/api/platform/presets")
    assert catalog.status_code == 200
    keys = {p["key"] for p in catalog.json()}
    assert "immigration_starter" in keys

    before_dt = (
        db.query(OrgDocumentType)
        .filter(OrgDocumentType.org_id == org_a["org"].id)
        .count()
    )
    assert before_dt == 0

    install = client_a.post("/api/platform/presets/immigration_starter/install")
    assert install.status_code == 200, install.text
    body = install.json()
    assert body["preset_key"] == "immigration_starter"
    assert len(body["created"]) == 2
    assert body["skipped"] == []

    db.expire_all()
    dts = (
        db.query(OrgDocumentType)
        .filter(OrgDocumentType.org_id == org_a["org"].id)
        .order_by(OrgDocumentType.slug.asc())
        .all()
    )
    assert len(dts) == 2
    by_slug = {d.slug: d for d in dts}
    assert set(by_slug) == {"employment-contract", "offer-letter"}

    # Offer Letter: country_selector enabled
    offer = by_slug["offer-letter"]
    offer_flow = (
        db.query(FlowConfig)
        .filter(FlowConfig.document_type_id == offer.id)
        .one()
    )
    assert offer_flow.is_published is False
    offer_steps = (
        db.query(FlowStep)
        .filter(FlowStep.flow_config_id == offer_flow.id)
        .order_by(FlowStep.order_index.asc())
        .all()
    )
    assert len(offer_steps) == 3
    assert offer_steps[0].step_type == "country_selector"
    assert offer_steps[0].is_enabled is True
    assert offer_steps[1].step_type == "party_selector"
    assert offer_steps[1].label == "Employer"
    assert offer_steps[1].is_enabled is True
    assert offer_steps[2].step_type == "custom_fields"
    offer_fields = (
        db.query(FieldDefinition)
        .filter(FieldDefinition.flow_step_id == offer_steps[2].id)
        .all()
    )
    assert {f.field_key for f in offer_fields} == {
        "cand_name",
        "joining_date",
        "salary",
        "job_title",
    }

    # Employment Contract: country_selector DISABLED
    contract = by_slug["employment-contract"]
    contract_flow = (
        db.query(FlowConfig)
        .filter(FlowConfig.document_type_id == contract.id)
        .one()
    )
    assert contract_flow.is_published is False
    contract_steps = (
        db.query(FlowStep)
        .filter(FlowStep.flow_config_id == contract_flow.id)
        .order_by(FlowStep.order_index.asc())
        .all()
    )
    assert len(contract_steps) == 3
    assert contract_steps[0].step_type == "country_selector"
    assert contract_steps[0].is_enabled is False
    assert contract_steps[1].step_type == "party_selector"
    assert contract_steps[1].is_enabled is True
    contract_fields = (
        db.query(FieldDefinition)
        .filter(FieldDefinition.flow_step_id == contract_steps[2].id)
        .all()
    )
    assert {f.field_key for f in contract_fields} == {
        "cand_name",
        "job_title",
        "start_date",
        "contract_duration",
    }


def test_install_idempotent_second_pass_skips_both(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    org_a = dual_org_clients["org_a"]

    first = client_a.post("/api/platform/presets/immigration_starter/install")
    assert first.status_code == 200
    assert len(first.json()["created"]) == 2

    db.expire_all()
    dt_before = (
        db.query(OrgDocumentType)
        .filter(OrgDocumentType.org_id == org_a["org"].id)
        .count()
    )
    flow_before = (
        db.query(FlowConfig)
        .join(OrgDocumentType, FlowConfig.document_type_id == OrgDocumentType.id)
        .filter(OrgDocumentType.org_id == org_a["org"].id)
        .count()
    )

    second = client_a.post("/api/platform/presets/immigration_starter/install")
    assert second.status_code == 200, second.text
    body = second.json()
    assert body["created"] == []
    assert len(body["skipped"]) == 2
    assert {s["slug"] for s in body["skipped"]} == {
        "offer-letter",
        "employment-contract",
    }
    assert all(s["reason"] == "document type slug already exists" for s in body["skipped"])

    db.expire_all()
    dt_after = (
        db.query(OrgDocumentType)
        .filter(OrgDocumentType.org_id == org_a["org"].id)
        .count()
    )
    flow_after = (
        db.query(FlowConfig)
        .join(OrgDocumentType, FlowConfig.document_type_id == OrgDocumentType.id)
        .filter(OrgDocumentType.org_id == org_a["org"].id)
        .count()
    )
    assert dt_after == dt_before == 2
    assert flow_after == flow_before == 2


def test_preset_rows_have_no_legacy_table_references(dual_org_clients):
    """Verify schema + created rows: no FKs/columns pointing at legacy tables."""
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]

    assert (
        client_a.post("/api/platform/presets/immigration_starter/install").status_code
        == 200
    )
    db.expire_all()

    # Schema-level: platform tables must not FK to legacy immigration tables
    for model in (OrgDocumentType, FlowConfig, FlowStep, FieldDefinition):
        table = model.__table__
        col_names = {c.name for c in table.columns}
        for frag in _FORBIDDEN_COLUMN_FRAGMENTS:
            assert frag not in col_names, f"{table.name} has forbidden column {frag}"

        for fk in table.foreign_keys:
            referred = fk.column.table.name
            assert referred not in _LEGACY_TABLES, (
                f"{table.name}.{fk.parent.name} FKs to legacy table {referred}"
            )

        # Extra: inspector on live bind
        insp = sa_inspect(db.bind)
        for fk in insp.get_foreign_keys(table.name):
            assert fk["referred_table"] not in _LEGACY_TABLES

    # Row-level: only org-scoped / platform FKs populated
    dts = db.query(OrgDocumentType).all()
    assert dts
    for dt in dts:
        assert dt.org_id  # organizations, not countries
        assert not hasattr(dt, "country_id")
        assert not hasattr(dt, "trade_id")
        assert not hasattr(dt, "company_id")

    for flow in db.query(FlowConfig).all():
        # document_type_id must resolve to org_document_types, not legacy document_types
        assert (
            db.query(OrgDocumentType)
            .filter(OrgDocumentType.id == flow.document_type_id)
            .count()
            == 1
        )


def test_cross_org_preset_install_isolated(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    client_b = dual_org_clients["client_b"]
    db = dual_org_clients["db"]
    org_a = dual_org_clients["org_a"]
    org_b = dual_org_clients["org_b"]

    assert (
        client_b.post("/api/platform/presets/immigration_starter/install").status_code
        == 200
    )

    list_a = client_a.get("/api/platform/document-types/")
    assert list_a.status_code == 200
    assert list_a.json() == []

    db.expire_all()
    assert (
        db.query(OrgDocumentType)
        .filter(OrgDocumentType.org_id == org_a["org"].id)
        .count()
        == 0
    )
    assert (
        db.query(OrgDocumentType)
        .filter(OrgDocumentType.org_id == org_b["org"].id)
        .count()
        == 2
    )

    list_b = client_b.get("/api/platform/document-types/")
    assert list_b.status_code == 200
    assert {d["slug"] for d in list_b.json()} == {
        "offer-letter",
        "employment-contract",
    }


def test_installed_flows_not_auto_published(dual_org_clients):
    client_a = dual_org_clients["client_a"]

    install = client_a.post("/api/platform/presets/immigration_starter/install")
    assert install.status_code == 200
    created = install.json()["created"]
    assert len(created) == 2

    for item in created:
        pub = client_a.get(f"/api/platform/{item['document_type_id']}/flow/published")
        assert pub.status_code == 404, pub.text

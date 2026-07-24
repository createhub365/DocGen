"""Phase 8 — document-type flow status flags for the builder."""
from __future__ import annotations

from models import FlowConfig, OrgDocumentType


def test_document_type_list_reports_published_and_draft_mix(dual_org_clients):
    client_a = dual_org_clients["client_a"]
    db = dual_org_clients["db"]
    org_a = dual_org_clients["org_a"]

    document_types = {}
    for slug in ("no-flow", "draft-only", "published-only", "both"):
        row = OrgDocumentType(
            org_id=org_a["org"].id,
            name=slug.replace("-", " ").title(),
            slug=slug,
            is_active=True,
            created_by=org_a["user"].id,
        )
        db.add(row)
        db.flush()
        document_types[slug] = row

    db.add(
        FlowConfig(
            document_type_id=document_types["draft-only"].id,
            version=1,
            is_published=False,
        )
    )
    db.add(
        FlowConfig(
            document_type_id=document_types["published-only"].id,
            version=1,
            is_published=True,
        )
    )
    db.add_all(
        [
            FlowConfig(
                document_type_id=document_types["both"].id,
                version=1,
                is_published=True,
            ),
            FlowConfig(
                document_type_id=document_types["both"].id,
                version=2,
                is_published=False,
            ),
        ]
    )
    db.commit()

    response = client_a.get("/api/platform/document-types/")
    assert response.status_code == 200, response.text
    by_slug = {row["slug"]: row for row in response.json()}

    assert (
        by_slug["no-flow"]["has_published_flow"],
        by_slug["no-flow"]["has_draft_flow"],
    ) == (False, False)
    assert (
        by_slug["draft-only"]["has_published_flow"],
        by_slug["draft-only"]["has_draft_flow"],
    ) == (False, True)
    assert (
        by_slug["published-only"]["has_published_flow"],
        by_slug["published-only"]["has_draft_flow"],
    ) == (True, False)
    assert (
        by_slug["both"]["has_published_flow"],
        by_slug["both"]["has_draft_flow"],
    ) == (True, True)

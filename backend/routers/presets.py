"""Starter-kit presets (prefix /api/platform).

Installs structure-only document types / draft flows. Does not touch legacy
immigration tables or copy template files.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, require_org_role
from database import get_db
from presets import PRESET_CATALOG, get_preset
from routers.platform_scope import log_audit_event

router = APIRouter(tags=["platform-presets"])


class PresetCatalogItem(BaseModel):
    key: str
    name: str
    description: str


class PresetInstallCreatedItem(BaseModel):
    document_type_id: int
    name: str
    slug: str
    flow_config_id: int


class PresetInstallSkippedItem(BaseModel):
    name: str
    slug: str
    reason: str


class PresetInstallResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    preset_key: str
    created: List[PresetInstallCreatedItem]
    skipped: List[PresetInstallSkippedItem]


@router.get("/presets", response_model=List[PresetCatalogItem])
def list_presets():
    """
    Public catalog of starter kits (static metadata only — no org data).

    Left unauthenticated so a signup / onboarding UI can show available kits
    before or immediately after the org JWT cookie is established.
    """
    return [PresetCatalogItem(**item) for item in PRESET_CATALOG]


@router.post(
    "/presets/{preset_key}/install",
    response_model=PresetInstallResponse,
)
def install_preset(
    preset_key: str,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    preset = get_preset(preset_key)
    if not preset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preset not found",
        )

    created: list[PresetInstallCreatedItem] = []
    skipped: list[PresetInstallSkippedItem] = []

    try:
        for dt_def in preset["document_types"]:
            slug = dt_def["slug"]
            existing = (
                db.query(models.OrgDocumentType)
                .filter(
                    models.OrgDocumentType.org_id == current.org_id,
                    models.OrgDocumentType.slug == slug,
                )
                .first()
            )
            if existing:
                skipped.append(
                    PresetInstallSkippedItem(
                        name=dt_def["name"],
                        slug=slug,
                        reason="document type slug already exists",
                    )
                )
                continue

            org_dt = models.OrgDocumentType(
                org_id=current.org_id,
                name=dt_def["name"],
                slug=slug,
                description=dt_def.get("description"),
                is_active=True,
                created_by=current.user_id,
            )
            db.add(org_dt)
            db.flush()

            flow = models.FlowConfig(
                document_type_id=org_dt.id,
                version=1,
                is_published=False,
            )
            db.add(flow)
            db.flush()

            for step_def in dt_def["steps"]:
                step = models.FlowStep(
                    flow_config_id=flow.id,
                    step_type=step_def["step_type"],
                    order_index=step_def["order_index"],
                    is_enabled=bool(step_def["is_enabled"]),
                    label=step_def["label"],
                    config_json=None,
                )
                db.add(step)
                db.flush()

                for field_def in step_def.get("fields") or []:
                    db.add(
                        models.FieldDefinition(
                            flow_step_id=step.id,
                            field_key=field_def["field_key"],
                            field_label=field_def["field_label"],
                            field_type=field_def["field_type"],
                            is_required=bool(field_def.get("is_required", False)),
                            options_json=field_def.get("options_json"),
                        )
                    )

            created.append(
                PresetInstallCreatedItem(
                    document_type_id=org_dt.id,
                    name=org_dt.name,
                    slug=org_dt.slug,
                    flow_config_id=flow.id,
                )
            )

        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to install preset; no changes were saved",
        )

    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "preset.installed",
        "Preset",
        preset_key,
        metadata={
            "preset_key": preset_key,
            "created_slugs": [c.slug for c in created],
            "skipped_slugs": [s.slug for s in skipped],
        },
    )

    return PresetInstallResponse(
        preset_key=preset_key,
        created=created,
        skipped=skipped,
    )

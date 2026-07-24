"""Org-scoped audit log listing (prefix /api/platform)."""

from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, require_org_role
from database import get_db

router = APIRouter(tags=["platform-audit"])


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    org_id: str
    actor_user_id: Optional[int] = None
    action: str
    target_type: str
    target_id: str
    metadata_json: Optional[Any] = None
    created_at: Any


class AuditLogListResponse(BaseModel):
    items: List[AuditLogRead]
    total: int
    limit: int
    offset: int


@router.get("/audit-log", response_model=AuditLogListResponse)
def list_audit_log(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    base = db.query(models.AuditLog).filter(
        models.AuditLog.org_id == current.org_id
    )
    total = base.count()
    rows = (
        base.order_by(models.AuditLog.created_at.desc(), models.AuditLog.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return AuditLogListResponse(
        items=[AuditLogRead.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )

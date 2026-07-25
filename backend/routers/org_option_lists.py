"""Org-scoped reusable option lists (prefix /api/platform)."""

from __future__ import annotations

import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

import models
from auth import OrgUserContext, get_current_org_user, require_org_role
from database import get_db
from routers.platform_scope import (
    get_org_option_list,
    get_org_option_list_item,
    log_audit_event,
)
from schemas_platform import (
    OrgOptionListCreate,
    OrgOptionListItemCreate,
    OrgOptionListItemRead,
    OrgOptionListItemUpdate,
    OrgOptionListRead,
    OrgOptionListSummary,
    OrgOptionListUpdate,
)

router = APIRouter(tags=["platform-option-lists"])

_SLUG_RE = re.compile(r"^[a-z][a-z0-9_-]*$")


def _normalize_slug(raw: str) -> str:
    return (raw or "").strip().lower()


@router.get("/option-lists", response_model=List[OrgOptionListSummary])
def list_option_lists(
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.OrgOptionList)
        .filter(models.OrgOptionList.org_id == current.org_id)
        .order_by(models.OrgOptionList.id.asc())
        .all()
    )
    result = []
    for row in rows:
        count = (
            db.query(models.OrgOptionListItem)
            .filter(models.OrgOptionListItem.list_id == row.id)
            .count()
        )
        result.append(
            OrgOptionListSummary(
                id=row.id,
                org_id=row.org_id,
                name=row.name,
                slug=row.slug,
                created_at=row.created_at,
                item_count=count,
            )
        )
    return result


@router.post(
    "/option-lists",
    response_model=OrgOptionListRead,
    status_code=status.HTTP_201_CREATED,
)
def create_option_list(
    body: OrgOptionListCreate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    name = (body.name or "").strip()
    slug = _normalize_slug(body.slug)
    if not name:
        raise HTTPException(status_code=422, detail="name is required")
    if not slug or not _SLUG_RE.match(slug):
        raise HTTPException(
            status_code=422,
            detail="slug must be lowercase letters, numbers, hyphens, underscores",
        )
    row = models.OrgOptionList(
        org_id=current.org_id,
        name=name,
        slug=slug,
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Option list slug already exists in this organization",
        )
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "option_list.created",
        "OrgOptionList",
        row.id,
        metadata={"slug": row.slug},
    )
    return OrgOptionListRead(
        id=row.id,
        org_id=row.org_id,
        name=row.name,
        slug=row.slug,
        created_at=row.created_at,
        items=[],
    )


@router.get("/option-lists/{list_id}", response_model=OrgOptionListRead)
def get_option_list(
    list_id: int,
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(models.OrgOptionList)
        .options(joinedload(models.OrgOptionList.items))
        .filter(
            models.OrgOptionList.id == list_id,
            models.OrgOptionList.org_id == current.org_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    items = sorted(row.items or [], key=lambda i: (i.sort_order, i.id))
    return OrgOptionListRead(
        id=row.id,
        org_id=row.org_id,
        name=row.name,
        slug=row.slug,
        created_at=row.created_at,
        items=[OrgOptionListItemRead.model_validate(i) for i in items],
    )


@router.patch("/option-lists/{list_id}", response_model=OrgOptionListRead)
def update_option_list(
    list_id: int,
    body: OrgOptionListUpdate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    row = get_org_option_list(db, list_id, current.org_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        if not name:
            raise HTTPException(status_code=422, detail="name is required")
        row.name = name
    if "slug" in data and data["slug"] is not None:
        slug = _normalize_slug(data["slug"])
        if not slug or not _SLUG_RE.match(slug):
            raise HTTPException(
                status_code=422,
                detail="slug must be lowercase letters, numbers, hyphens, underscores",
            )
        row.slug = slug
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Option list slug already exists in this organization",
        )
    items = (
        db.query(models.OrgOptionListItem)
        .filter(models.OrgOptionListItem.list_id == row.id)
        .order_by(
            models.OrgOptionListItem.sort_order.asc(),
            models.OrgOptionListItem.id.asc(),
        )
        .all()
    )
    return OrgOptionListRead(
        id=row.id,
        org_id=row.org_id,
        name=row.name,
        slug=row.slug,
        created_at=row.created_at,
        items=[OrgOptionListItemRead.model_validate(i) for i in items],
    )


@router.delete("/option-lists/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_option_list(
    list_id: int,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    row = get_org_option_list(db, list_id, current.org_id)
    refs = (
        db.query(models.FieldDefinition)
        .filter(models.FieldDefinition.option_list_id == row.id)
        .all()
    )
    if refs:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Option list is in use by one or more fields",
                "field_keys": sorted({f.field_key for f in refs}),
                "field_ids": sorted({f.id for f in refs}),
            },
        )
    db.delete(row)
    db.commit()
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "option_list.deleted",
        "OrgOptionList",
        list_id,
        metadata={},
    )
    return None


@router.post(
    "/option-lists/{list_id}/items",
    response_model=OrgOptionListItemRead,
    status_code=status.HTTP_201_CREATED,
)
def add_option_list_item(
    list_id: int,
    body: OrgOptionListItemCreate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    get_org_option_list(db, list_id, current.org_id)
    value = (body.value or "").strip()
    label = (body.label or "").strip()
    if not value or not label:
        raise HTTPException(status_code=422, detail="value and label are required")
    item = models.OrgOptionListItem(
        list_id=list_id,
        value=value,
        label=label,
        sort_order=body.sort_order,
        is_active=body.is_active,
    )
    db.add(item)
    try:
        db.commit()
        db.refresh(item)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Item value already exists on this list",
        )
    return item


@router.patch(
    "/option-list-items/{item_id}",
    response_model=OrgOptionListItemRead,
)
def update_option_list_item(
    item_id: int,
    body: OrgOptionListItemUpdate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    item = get_org_option_list_item(db, item_id, current.org_id)
    data = body.model_dump(exclude_unset=True)
    if "value" in data and data["value"] is not None:
        data["value"] = data["value"].strip()
        if not data["value"]:
            raise HTTPException(status_code=422, detail="value is required")
    if "label" in data and data["label"] is not None:
        data["label"] = data["label"].strip()
        if not data["label"]:
            raise HTTPException(status_code=422, detail="label is required")
    for key, value in data.items():
        setattr(item, key, value)
    try:
        db.commit()
        db.refresh(item)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Item value already exists on this list",
        )
    return item


@router.delete(
    "/option-list-items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_option_list_item(
    item_id: int,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    item = get_org_option_list_item(db, item_id, current.org_id)
    db.delete(item)
    db.commit()
    return None

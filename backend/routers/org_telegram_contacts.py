"""Org Telegram contact CRUD (prefix /api/platform).

Management (create/update/delete): org_admin only — chat IDs are sensitive
org configuration. Any authenticated org user may list contacts so staff can
pick a destination when sharing a generated document.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, get_current_org_user, require_org_role
from database import get_db
from routers.platform_scope import log_audit_event
from schemas_platform import (
    TelegramContactCreate,
    TelegramContactRead,
    TelegramContactUpdate,
)

router = APIRouter(prefix="/telegram-contacts", tags=["platform-telegram-contacts"])


def _get_org_contact(
    db: Session, contact_id: int, org_id: str
) -> models.TelegramContact:
    row = (
        db.query(models.TelegramContact)
        .filter(
            models.TelegramContact.id == contact_id,
            models.TelegramContact.org_id == org_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


@router.get("", response_model=list[TelegramContactRead])
def list_telegram_contacts(
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.TelegramContact)
        .filter(models.TelegramContact.org_id == current.org_id)
        .order_by(models.TelegramContact.label.asc(), models.TelegramContact.id.asc())
        .all()
    )
    return rows


@router.post(
    "",
    response_model=TelegramContactRead,
    status_code=status.HTTP_201_CREATED,
)
def create_telegram_contact(
    body: TelegramContactCreate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    label = (body.label or "").strip()
    chat_id = (body.chat_id or "").strip()
    if not label:
        raise HTTPException(status_code=400, detail="label is required")
    if not chat_id:
        raise HTTPException(status_code=400, detail="chat_id is required")

    row = models.TelegramContact(
        org_id=current.org_id,
        label=label,
        chat_id=chat_id,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A contact with this chat_id already exists",
        )
    db.refresh(row)
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "telegram_contact.created",
        "TelegramContact",
        str(row.id),
        {"label": row.label, "chat_id": row.chat_id},
    )
    return row


@router.patch("/{contact_id}", response_model=TelegramContactRead)
def update_telegram_contact(
    contact_id: int,
    body: TelegramContactUpdate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    row = _get_org_contact(db, contact_id, current.org_id)
    if body.label is not None:
        label = body.label.strip()
        if not label:
            raise HTTPException(status_code=400, detail="label is required")
        row.label = label
    if body.chat_id is not None:
        chat_id = body.chat_id.strip()
        if not chat_id:
            raise HTTPException(status_code=400, detail="chat_id is required")
        row.chat_id = chat_id
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A contact with this chat_id already exists",
        )
    db.refresh(row)
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "telegram_contact.updated",
        "TelegramContact",
        str(row.id),
        {"label": row.label, "chat_id": row.chat_id},
    )
    return row


@router.delete("/{contact_id}", status_code=status.HTTP_200_OK)
def delete_telegram_contact(
    contact_id: int,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    row = _get_org_contact(db, contact_id, current.org_id)
    label = row.label
    db.delete(row)
    db.commit()
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "telegram_contact.deleted",
        "TelegramContact",
        str(contact_id),
        {"label": label},
    )
    return {"ok": True, "id": contact_id}

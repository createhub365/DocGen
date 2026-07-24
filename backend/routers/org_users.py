"""Org user invite / membership management (prefix /api/platform)."""

from __future__ import annotations

import secrets
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from auth import OrgUserContext, hash_password, require_org_role
from database import get_db
from limiter import get_org_actor_key, limiter, platform_invite_limit
from routers.platform_scope import count_org_admins, get_org_membership, log_audit_event
from schemas_platform import (
    OrgUserInviteRequest,
    OrgUserInviteResponse,
    OrgUserRead,
    OrgUserRoleUpdate,
)

router = APIRouter(tags=["platform-org-users"])

_ALLOWED_ROLES = frozenset({"staff", "org_admin"})


def _guard_last_admin(db: Session, org_id: str, membership: models.OrgUser) -> None:
    if membership.role != "org_admin":
        return
    if count_org_admins(db, org_id) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove or demote the last org_admin in this organization",
        )


@router.post(
    "/users/invite",
    response_model=OrgUserInviteResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(platform_invite_limit, key_func=get_org_actor_key)
def invite_org_user(
    request: Request,
    body: OrgUserInviteRequest,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    # User model has username (no email column) — invite "email" is stored as username.
    username = (body.email or "").strip().lower()
    role = (body.role or "").strip()
    if not username:
        raise HTTPException(status_code=422, detail="email is required")
    if role not in _ALLOWED_ROLES:
        raise HTTPException(
            status_code=422,
            detail="role must be 'staff' or 'org_admin'",
        )

    existing_user = (
        db.query(models.User).filter(models.User.username == username).first()
    )
    if existing_user:
        any_membership = (
            db.query(models.OrgUser)
            .filter(models.OrgUser.user_id == existing_user.id)
            .first()
        )
        if any_membership:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User already belongs to an organization",
            )
        user = existing_user
        temp_password = None
    else:
        temp_password = secrets.token_urlsafe(12)
        user = models.User(
            username=username,
            full_name=username.split("@")[0],
            password_hash=hash_password(temp_password),
            role="staff",
            is_active=True,
        )
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already exists",
            )

    membership = models.OrgUser(
        org_id=current.org_id,
        user_id=user.id,
        role=role,
    )
    db.add(membership)
    try:
        db.commit()
        db.refresh(membership)
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already belongs to an organization",
        )

    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "user.invited",
        "OrgUser",
        membership.id,
        metadata={"role": role, "username": user.username},
    )

    return OrgUserInviteResponse(
        membership=OrgUserRead.model_validate(membership),
        username=user.username,
        temporary_password=temp_password,
    )


@router.get("/users", response_model=List[OrgUserRead])
def list_org_users(
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.OrgUser)
        .filter(models.OrgUser.org_id == current.org_id)
        .order_by(models.OrgUser.id.asc())
        .all()
    )


@router.patch("/users/{org_user_id}/role", response_model=OrgUserRead)
def update_org_user_role(
    org_user_id: int,
    body: OrgUserRoleUpdate,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    membership = get_org_membership(db, org_user_id, current.org_id)
    new_role = (body.role or "").strip()
    if new_role not in _ALLOWED_ROLES:
        raise HTTPException(
            status_code=422,
            detail="role must be 'staff' or 'org_admin'",
        )

    if membership.role == "org_admin" and new_role != "org_admin":
        _guard_last_admin(db, current.org_id, membership)

    old_role = membership.role
    membership.role = new_role
    db.commit()
    db.refresh(membership)
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "user.role_changed",
        "OrgUser",
        membership.id,
        metadata={"old_role": old_role, "new_role": new_role},
    )
    return membership


@router.delete("/users/{org_user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_org_user(
    org_user_id: int,
    current: OrgUserContext = Depends(require_org_role("org_admin")),
    db: Session = Depends(get_db),
):
    membership = get_org_membership(db, org_user_id, current.org_id)
    _guard_last_admin(db, current.org_id, membership)
    target_id = membership.id
    removed_user_id = membership.user_id
    db.delete(membership)
    db.commit()
    log_audit_event(
        db,
        current.org_id,
        current.user_id,
        "user.removed",
        "OrgUser",
        target_id,
        metadata={"removed_user_id": removed_user_id},
    )
    return None

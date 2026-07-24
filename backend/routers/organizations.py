"""Platform organization signup and /me (prefix mounted at /api/platform)."""

from __future__ import annotations

import os
import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from auth import (
    COOKIE_MAX_AGE,
    PLATFORM_ACCESS_COOKIE,
    OrgUserContext,
    create_org_jwt,
    get_current_org_user,
    hash_password,
    verify_password,
)
from database import get_db
from limiter import limiter, platform_login_limit, platform_signup_limit
from schemas_platform import (
    OrganizationRead,
    OrgSignupRequest,
    OrgSignupResponse,
    OrgUserRead,
    PlatformLoginRequest,
    PlatformLoginResponse,
)

router = APIRouter(tags=["platform-organizations"])

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _cookie_params() -> dict:
    is_prod = os.getenv("ENVIRONMENT", "development").lower() == "production"
    return {
        "httponly": True,
        "secure": is_prod,
        "samesite": "none" if is_prod else "lax",
        "max_age": COOKIE_MAX_AGE,
        "path": "/",
    }


def _set_platform_access_cookie(response: Response, token: str) -> None:
    params = _cookie_params()
    try:
        response.set_cookie(key=PLATFORM_ACCESS_COOKIE, value=token, **params)
    except Exception:
        try:
            params.pop("partitioned", None)
            response.set_cookie(key=PLATFORM_ACCESS_COOKIE, value=token, **params)
        except Exception:
            pass


def _clear_platform_access_cookie(response: Response) -> None:
    params = {k: v for k, v in _cookie_params().items() if k != "max_age"}
    response.delete_cookie(key=PLATFORM_ACCESS_COOKIE, **params)


@router.post("/signup", response_model=OrgSignupResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(platform_signup_limit)
def signup(
    request: Request,
    body: OrgSignupRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    name = (body.name or "").strip()
    slug = (body.slug or "").strip().lower()
    username = (body.username or "").strip()
    password = body.password or ""

    if not name or not slug or not username or not password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="name, slug, username, and password are required",
        )
    if not _SLUG_RE.match(slug):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="slug must be URL-safe (lowercase letters, numbers, hyphens)",
        )

    # Pre-check uniqueness → clean 409 (not a raw IntegrityError)
    if db.query(models.Organization).filter(models.Organization.slug == slug).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Organization slug already exists",
        )
    if db.query(models.Organization).filter(models.Organization.name == name).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Organization name already exists",
        )
    if db.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )

    try:
        user = models.User(
            username=username,
            full_name=(body.full_name or "").strip(),
            password_hash=hash_password(password),
            role="staff",
            is_active=True,
        )
        db.add(user)
        db.flush()

        org = models.Organization(name=name, slug=slug, is_active=True)
        db.add(org)
        db.flush()

        membership = models.OrgUser(
            org_id=org.id,
            user_id=user.id,
            role="org_admin",
        )
        db.add(membership)
        db.commit()
        db.refresh(org)
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Organization or username already exists",
        )

    token = create_org_jwt(user_id=user.id, org_id=org.id, role="org_admin")
    _set_platform_access_cookie(response, token)

    return OrgSignupResponse(
        organization=OrganizationRead.model_validate(org),
        user_id=user.id,
        role="org_admin",
        access_token=token,
    )


@router.post("/login", response_model=PlatformLoginResponse)
@limiter.limit(platform_login_limit)
def platform_login(
    request: Request,
    body: PlatformLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    """Issue an org-scoped JWT for a user with OrgUser membership."""
    username = (body.username or "").strip()
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not verify_password(body.password or "", user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    if not getattr(user, "is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    membership = (
        db.query(models.OrgUser).filter(models.OrgUser.user_id == user.id).first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is not a member of any organization",
        )

    org = (
        db.query(models.Organization)
        .filter(
            models.Organization.id == membership.org_id,
            models.Organization.is_active.is_(True),
        )
        .first()
    )
    if not org:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Organization inactive or not found",
        )

    token = create_org_jwt(
        user_id=user.id, org_id=membership.org_id, role=membership.role
    )
    _set_platform_access_cookie(response, token)
    return PlatformLoginResponse(
        organization=OrganizationRead.model_validate(org),
        user_id=user.id,
        role=membership.role,
        access_token=token,
    )


@router.post("/logout")
def platform_logout(response: Response):
    """Clear only the platform org JWT cookie; leave legacy access_token alone."""
    _clear_platform_access_cookie(response)
    return {"message": "Logged out"}


@router.get("/me")
def me(
    current: OrgUserContext = Depends(get_current_org_user),
    db: Session = Depends(get_db),
):
    """Return org + membership for the authenticated user only (org_id from token)."""
    org = (
        db.query(models.Organization)
        .filter(
            models.Organization.id == current.org_id,
            models.Organization.is_active.is_(True),
        )
        .first()
    )
    if not org:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Organization inactive or not found",
        )

    membership = (
        db.query(models.OrgUser)
        .filter(
            models.OrgUser.org_id == current.org_id,
            models.OrgUser.user_id == current.user_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not a member of this organization",
        )

    user = (
        db.query(models.User)
        .filter(models.User.id == current.user_id)
        .first()
    )

    return {
        "organization": OrganizationRead.model_validate(org),
        "membership": OrgUserRead.model_validate(membership),
        "username": user.username if user else None,
        "user_id": current.user_id,
        "role": current.role,
    }

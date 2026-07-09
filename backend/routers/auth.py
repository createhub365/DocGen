import os
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

import models
from auth import (
    COOKIE_MAX_AGE,
    create_access_token,
    resolve_request_token,
    resolve_user_from_token,
    verify_password,
)
from database import get_db
from limiter import limiter
from schemas import LoginRequest, LoginResponse, UserResponse

router = APIRouter(tags=["auth"])


def _cookie_params() -> dict:
    is_prod = os.getenv("ENVIRONMENT", "development").lower() == "production"
    return {
        "httponly": True,
        "secure": is_prod,
        "samesite": "none" if is_prod else "lax",
        "max_age": COOKIE_MAX_AGE,
        "path": "/",
    }


def _set_access_cookie(response: Response, token: str) -> None:
    """Set auth cookie. Failures are non-fatal — Bearer token is also returned."""
    params = _cookie_params()
    try:
        response.set_cookie(key="access_token", value=token, **params)
    except Exception:
        try:
            params.pop("partitioned", None)
            response.set_cookie(key="access_token", value=token, **params)
        except Exception:
            pass


def _display_name(user: models.User) -> str:
    name = (getattr(user, "full_name", None) or "").strip()
    return name or user.username


@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    db: Session = Depends(get_db),
):
    try:
        user = db.query(models.User).filter(models.User.username == body.username).first()
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Check DATABASE_URL on the server.",
        )
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    if not getattr(user, "is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive. Contact your administrator.",
        )
    token = create_access_token(data={"sub": user.username})
    _set_access_cookie(response, token)
    return LoginResponse(
        role=user.role,
        username=user.username,
        name=_display_name(user),
        access_token=token,
    )


@router.post("/logout")
def logout(response: Response):
    params = {k: v for k, v in _cookie_params().items() if k != "max_age"}
    response.delete_cookie(key="access_token", **params)
    return {"message": "Logged out"}


@router.get("/me", response_model=Optional[UserResponse])
def get_me(
    access_token: Optional[str] = Cookie(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Return current user, or null when not logged in (no 401 for session checks)."""
    token = resolve_request_token(access_token, authorization)
    if not token:
        return None

    try:
        user = resolve_user_from_token(token, db)
    except SQLAlchemyError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Check DATABASE_URL on the server.",
        )
    if not user:
        return None

    return UserResponse(
        id=user.id,
        username=user.username,
        name=_display_name(user),
        role=user.role,
        is_active=bool(getattr(user, "is_active", True)),
    )

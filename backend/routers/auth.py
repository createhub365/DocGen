import os

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

import models
from auth import (
    COOKIE_MAX_AGE,
    create_access_token,
    get_current_user,
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
    response.set_cookie(key="access_token", value=token, **_cookie_params())
    return LoginResponse(role=user.role, username=user.username, name=_display_name(user))


@router.post("/logout")
def logout(response: Response):
    params = {k: v for k, v in _cookie_params().items() if k != "max_age"}
    response.delete_cookie(key="access_token", **params)
    return {"message": "Logged out"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        name=_display_name(current_user),
        role=current_user.role,
        is_active=bool(getattr(current_user, "is_active", True)),
    )

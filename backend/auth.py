import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from dotenv import load_dotenv
from fastapi import Cookie, Depends, Header, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database import get_db
import models

load_dotenv()

# ── C-02: Fail fast if JWT_SECRET is absent or weak ───────────
_JWT_SECRET = os.getenv("JWT_SECRET", "")
_WEAK_SECRETS = {
    "", "changeme", "changeme_use_strong_random_secret",
    "secret", "password", "12345", "test", "dev",
}
if _JWT_SECRET in _WEAK_SECRETS:
    print(
        "\n[FATAL] JWT_SECRET is not set or is using a weak default value.\n"
        "Generate a strong secret with:\n"
        "  python -c \"import secrets; print(secrets.token_hex(32))\"\n"
        "Then add it to backend/.env as: JWT_SECRET=<your_secret>\n",
        file=sys.stderr,
    )
    if os.getenv("ENVIRONMENT", "development").lower() == "production":
        sys.exit(1)

SECRET_KEY = _JWT_SECRET or "changeme_use_strong_random_secret"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480
COOKIE_MAX_AGE = 60 * 60 * 8
# Legacy auth cookie (routers/auth.py) — do not reuse for platform JWTs.
LEGACY_ACCESS_COOKIE = "access_token"
# Platform org JWT cookie — must stay distinct so both sessions can coexist.
PLATFORM_ACCESS_COOKIE = "platform_access_token"


@dataclass(frozen=True)
class OrgUserContext:
    """Authenticated platform user scoped to a single organization."""

    user_id: int
    org_id: str
    role: str


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_org_jwt(
    user_id: int,
    org_id: str,
    role: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Issue a platform JWT (same secret/expiry pattern as legacy; separate cookie)."""
    return create_access_token(
        data={
            "user_id": user_id,
            "org_id": org_id,
            "role": role,
            "token_type": "org",
        },
        expires_delta=expires_delta,
    )


def extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        return token or None
    return None


def resolve_user_from_token(token: str, db: Session) -> Optional[models.User]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            return None
    except JWTError:
        return None

    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not getattr(user, "is_active", True):
        return None
    return user


def resolve_request_token(
    access_token: Optional[str],
    authorization: Optional[str],
) -> Optional[str]:
    return access_token or extract_bearer_token(authorization)


def get_current_user(
    access_token: Optional[str] = Cookie(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> models.User:
    token = resolve_request_token(access_token, authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    user = resolve_user_from_token(token, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )
    return user


def get_admin_user(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


def get_current_org_user(
    platform_access_token: Optional[str] = Cookie(
        None, alias=PLATFORM_ACCESS_COOKIE
    ),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> OrgUserContext:
    """
    Resolve the platform org JWT from the platform_access_token cookie
    (or Authorization Bearer). Never reads the legacy access_token cookie.

    Missing/invalid/expired token → 401.
    Token org deactivated (or missing) → 401 (never return stale org context).
    """
    token = resolve_request_token(platform_access_token, authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    user_id = payload.get("user_id")
    org_id = payload.get("org_id")
    role = payload.get("role")
    if user_id is None or not org_id or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    org = (
        db.query(models.Organization)
        .filter(
            models.Organization.id == org_id,
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
            models.OrgUser.org_id == org_id,
            models.OrgUser.user_id == int(user_id),
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not a member of this organization",
        )

    return OrgUserContext(
        user_id=int(user_id),
        org_id=str(org_id),
        role=str(membership.role),
    )


def require_org_role(required_role: str):
    """Dependency factory: org_admin always passes; otherwise role must match."""

    def _dependency(
        current: OrgUserContext = Depends(get_current_org_user),
    ) -> OrgUserContext:
        if current.role == "org_admin":
            return current
        if current.role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient organization role",
            )
        return current

    return _dependency

import os
import sys
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

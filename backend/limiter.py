from slowapi import Limiter
from slowapi.util import get_remote_address
from jose import JWTError, jwt
from fastapi import Request

from auth import ALGORITHM, SECRET_KEY, PLATFORM_ACCESS_COOKIE

limiter = Limiter(key_func=get_remote_address)


def get_org_actor_key(request: Request) -> str:
    """
    Rate-limit key for authenticated platform writes (e.g. invite).
    Prefer org_id + user_id from the org JWT; fall back to IP.
    """
    token = request.cookies.get(PLATFORM_ACCESS_COOKIE)
    if not token:
        auth = request.headers.get("authorization") or ""
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
    if token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            org_id = payload.get("org_id")
            user_id = payload.get("user_id")
            if org_id and user_id is not None:
                return f"org:{org_id}:user:{user_id}"
        except JWTError:
            pass
    return get_remote_address(request)


def platform_signup_limit() -> str:
    return os_getenv_limit("PLATFORM_SIGNUP_RATE_LIMIT", "5/hour")


def platform_login_limit() -> str:
    # Same default as legacy POST /api/auth/login
    return os_getenv_limit("PLATFORM_LOGIN_RATE_LIMIT", "10/minute")


def platform_invite_limit() -> str:
    return os_getenv_limit("PLATFORM_INVITE_RATE_LIMIT", "20/hour")


def os_getenv_limit(name: str, default: str) -> str:
    import os

    return os.getenv(name, default) or default

"""Unit tests for org-aware auth (Task 1) — before platform routers."""
from __future__ import annotations

from datetime import timedelta

import pytest
from jose import jwt

from auth import (
    ALGORITHM,
    SECRET_KEY,
    create_org_jwt,
    get_current_org_user,
    hash_password,
)
from models import Organization, OrgUser, User


def _seed_active_org(db, *, slug="auth-org"):
    user = User(
        username=f"user_{slug}",
        full_name="Auth User",
        password_hash=hash_password("pw"),
        role="staff",
        is_active=True,
    )
    db.add(user)
    db.flush()
    org = Organization(name="Auth Org", slug=slug, is_active=True)
    db.add(org)
    db.flush()
    db.add(OrgUser(org_id=org.id, user_id=user.id, role="org_admin"))
    db.commit()
    db.refresh(org)
    db.refresh(user)
    return org, user


def test_valid_org_token_accepted(db):
    org, user = _seed_active_org(db, slug="valid-org")
    token = create_org_jwt(user_id=user.id, org_id=org.id, role="org_admin")

    ctx = get_current_org_user(platform_access_token=token, authorization=None, db=db)
    assert ctx.user_id == user.id
    assert ctx.org_id == org.id
    assert ctx.role == "org_admin"


def test_expired_org_token_rejected(db):
    org, user = _seed_active_org(db, slug="expired-org")
    token = create_org_jwt(
        user_id=user.id,
        org_id=org.id,
        role="org_admin",
        expires_delta=timedelta(seconds=-10),
    )

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        get_current_org_user(platform_access_token=token, authorization=None, db=db)
    assert exc.value.status_code == 401


def test_tampered_org_token_rejected(db):
    org, user = _seed_active_org(db, slug="tamper-org")
    token = create_org_jwt(user_id=user.id, org_id=org.id, role="org_admin")
    # Flip a character in the signature segment
    parts = token.split(".")
    assert len(parts) == 3
    sig = parts[2]
    flipped = ("A" if sig[0] != "A" else "B") + sig[1:]
    tampered = ".".join([parts[0], parts[1], flipped])

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        get_current_org_user(platform_access_token=tampered, authorization=None, db=db)
    assert exc.value.status_code == 401


def test_deactivated_org_token_rejected(db):
    org, user = _seed_active_org(db, slug="dead-org")
    token = create_org_jwt(user_id=user.id, org_id=org.id, role="org_admin")

    org.is_active = False
    db.commit()

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        get_current_org_user(platform_access_token=token, authorization=None, db=db)
    assert exc.value.status_code == 401


def test_missing_token_rejected(db):
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        get_current_org_user(platform_access_token=None, authorization=None, db=db)
    assert exc.value.status_code == 401


def test_org_jwt_payload_contains_required_claims(db):
    org, user = _seed_active_org(db, slug="claims-org")
    token = create_org_jwt(user_id=user.id, org_id=org.id, role="staff")
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["user_id"] == user.id
    assert payload["org_id"] == org.id
    assert payload["role"] == "staff"
    assert "exp" in payload

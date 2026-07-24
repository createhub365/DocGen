"""Platform vs legacy cookie isolation (platform_access_token vs access_token)."""
from __future__ import annotations

from auth import PLATFORM_ACCESS_COOKIE, hash_password
from models import Organization, OrgUser, User


def test_legacy_and_platform_sessions_coexist_in_same_cookie_jar(client, db):
    """
    Both cookies in one jar must remain valid simultaneously.
    This is the regression test for the shared access_token bug.
    """
    password = "dual-session-pass-99"
    user = User(
        username="dual.session@example.com",
        full_name="Dual Session",
        password_hash=hash_password(password),
        role="staff",
        is_active=True,
    )
    db.add(user)
    db.flush()
    org = Organization(name="Dual Org", slug="dual-org", is_active=True)
    db.add(org)
    db.flush()
    db.add(OrgUser(org_id=org.id, user_id=user.id, role="org_admin"))
    db.commit()

    legacy = client.post(
        "/api/auth/login",
        json={"username": "dual.session@example.com", "password": password},
    )
    assert legacy.status_code == 200, legacy.text
    assert "access_token" in client.cookies

    platform = client.post(
        "/api/platform/login",
        json={"username": "dual.session@example.com", "password": password},
    )
    assert platform.status_code == 200, platform.text
    assert PLATFORM_ACCESS_COOKIE in client.cookies
    assert "access_token" in client.cookies
    assert client.cookies.get("access_token") != client.cookies.get(
        PLATFORM_ACCESS_COOKIE
    )

    legacy_me = client.get("/api/auth/me")
    assert legacy_me.status_code == 200, legacy_me.text
    assert legacy_me.json()["username"] == "dual.session@example.com"

    platform_me = client.get("/api/platform/me")
    assert platform_me.status_code == 200, platform_me.text
    assert platform_me.json()["organization"]["slug"] == "dual-org"
    assert platform_me.json()["role"] == "org_admin"


def test_platform_logout_clears_only_platform_cookie(client, db):
    password = "logout-iso-pass-99"
    user = User(
        username="logout.iso@example.com",
        full_name="Logout Iso",
        password_hash=hash_password(password),
        role="staff",
        is_active=True,
    )
    db.add(user)
    db.flush()
    org = Organization(name="Logout Org", slug="logout-org", is_active=True)
    db.add(org)
    db.flush()
    db.add(OrgUser(org_id=org.id, user_id=user.id, role="org_admin"))
    db.commit()

    assert (
        client.post(
            "/api/auth/login",
            json={"username": "logout.iso@example.com", "password": password},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/platform/login",
            json={"username": "logout.iso@example.com", "password": password},
        ).status_code
        == 200
    )

    logout = client.post("/api/platform/logout")
    assert logout.status_code == 200, logout.text

    # Platform session gone
    platform_me = client.get("/api/platform/me")
    assert platform_me.status_code == 401

    # Legacy session untouched
    legacy_me = client.get("/api/auth/me")
    assert legacy_me.status_code == 200, legacy_me.text
    assert legacy_me.json()["username"] == "logout.iso@example.com"
    assert "access_token" in client.cookies

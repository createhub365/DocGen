"""
Pytest configuration for platform (multi-tenant) tests.

CRITICAL: Never opens docgen.db. Uses an in-memory SQLite engine with
StaticPool so every connection shares the same empty database.
"""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

# Isolate before any app imports — must not point at docgen.db
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET"] = (
    "test_jwt_secret_for_platform_isolation_tests_only_64chars_xx"
)
os.environ["ENVIRONMENT"] = "development"
os.environ["ALLOW_DEMO_SEED"] = "false"
os.environ["DOCGEN_SKIP_PDF"] = "true"
# High limits so suite signup/login/invite traffic does not trip SlowAPI;
# the dedicated rate-limit test temporarily lowers PLATFORM_SIGNUP_RATE_LIMIT.
os.environ["PLATFORM_SIGNUP_RATE_LIMIT"] = "1000/hour"
os.environ["PLATFORM_LOGIN_RATE_LIMIT"] = "1000/minute"
os.environ["PLATFORM_INVITE_RATE_LIMIT"] = "1000/hour"

_TEST_FILE_ROOT = Path(tempfile.mkdtemp(prefix="docgen_platform_test_"))
_TEST_TEMPLATE_DIR = _TEST_FILE_ROOT / "template_store"
_TEST_OUTPUT_DIR = _TEST_FILE_ROOT / "output"
_TEST_TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
_TEST_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
os.environ["TEMPLATE_DIR"] = str(_TEST_TEMPLATE_DIR)
os.environ["OUTPUT_DIR"] = str(_TEST_OUTPUT_DIR)

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import database
from database import Base, get_db

# Replace the module engine with a shared in-memory DB (NOT docgen.db).
_test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(_test_engine, "connect")
def _fk_on(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


database.engine = _test_engine
database.SessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=_test_engine
)

import models  # noqa: E402,F401 — register tables on Base
from auth import hash_password  # noqa: E402
from main import app  # noqa: E402
from models import Organization, OrgUser, User  # noqa: E402

TestingSessionLocal = database.SessionLocal

# Report helpers
TEST_DATABASE_URL = "sqlite:///:memory: (StaticPool — NOT docgen.db)"
TEST_DB_FILE = ":memory:"
TEST_TEMPLATE_DIR = str(_TEST_TEMPLATE_DIR)
TEST_OUTPUT_DIR = str(_TEST_OUTPUT_DIR)


def _clear_all_rows() -> None:
    with _test_engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture(scope="session", autouse=True)
def _prepare_test_database():
    Base.metadata.drop_all(bind=_test_engine)
    Base.metadata.create_all(bind=_test_engine)
    yield
    Base.metadata.drop_all(bind=_test_engine)
    _test_engine.dispose()
    shutil.rmtree(_TEST_FILE_ROOT, ignore_errors=True)


@pytest.fixture(autouse=True)
def _fresh_rows():
    _clear_all_rows()
    # Clear org-scoped files between tests (keep root dirs)
    for root in (_TEST_TEMPLATE_DIR, _TEST_OUTPUT_DIR):
        for child in root.iterdir():
            if child.is_dir():
                shutil.rmtree(child, ignore_errors=True)
            else:
                child.unlink(missing_ok=True)
    yield
    _clear_all_rows()


@pytest.fixture()
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _override_get_db_factory():
    def _override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    return _override_get_db


@pytest.fixture()
def client():
    app.dependency_overrides[get_db] = _override_get_db_factory()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _make_org_admin(db, *, slug: str, username: str, org_name: str):
    from auth import create_org_jwt

    user = User(
        username=username,
        full_name=f"{org_name} Admin",
        password_hash=hash_password("test-password-123"),
        role="staff",
        is_active=True,
    )
    db.add(user)
    db.flush()

    org = Organization(name=org_name, slug=slug, is_active=True)
    db.add(org)
    db.flush()

    membership = OrgUser(
        org_id=org.id,
        user_id=user.id,
        role="org_admin",
    )
    db.add(membership)
    db.commit()
    db.refresh(org)
    db.refresh(user)
    db.refresh(membership)

    token = create_org_jwt(user_id=user.id, org_id=org.id, role="org_admin")
    return {
        "org": org,
        "user": user,
        "membership": membership,
        "token": token,
    }


@pytest.fixture()
def dual_org_clients(db):
    """
    Two fully separate orgs, each with an org_admin and an authenticated client.

    Reused by Task 3 tenant-isolation tests.
    """
    org_a = _make_org_admin(
        db, slug="org-a", username="admin_a", org_name="Organization A"
    )
    org_b = _make_org_admin(
        db, slug="org-b", username="admin_b", org_name="Organization B"
    )

    app.dependency_overrides[get_db] = _override_get_db_factory()

    client_a = TestClient(app)
    client_a.cookies.set("platform_access_token", org_a["token"])

    client_b = TestClient(app)
    client_b.cookies.set("platform_access_token", org_b["token"])

    yield {
        "org_a": org_a,
        "org_b": org_b,
        "client_a": client_a,
        "client_b": client_b,
        "db": db,
    }

    client_a.close()
    client_b.close()
    app.dependency_overrides.clear()

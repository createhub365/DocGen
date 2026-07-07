from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os
import sqlite3

load_dotenv()


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif url.startswith("postgresql://") and "+psycopg2" not in url:
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)

    if url.startswith("postgresql") and "sslmode=" not in url:
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}sslmode=require"

    return url


DATABASE_URL = _normalize_database_url(
    os.getenv("DATABASE_URL", "sqlite:///./docgen.db")
)

_engine_kwargs: dict = {}
_connect_args: dict = {}

if DATABASE_URL.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}
else:
    _engine_kwargs = {
        "pool_pre_ping": True,
        "pool_size": int(os.getenv("DB_POOL_SIZE", "5")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "10")),
    }

engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    **_engine_kwargs,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

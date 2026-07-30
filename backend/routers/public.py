from datetime import datetime, timezone
import os

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.orm import Session

import models
from database import get_db
from services.generated_document_storage import (
    GeneratedDocumentStorageError,
    get_generated_document_bytes,
)
from services.pdf_converter import pdf_converter_available

router = APIRouter(tags=["public"])

OUTPUT_DIR = os.getenv("OUTPUT_DIR", "./output")

_EXPIRED_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Link expired</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f7f4f4; color: #1f1f1f;
           display: grid; place-items: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; border: 1px solid #e8d8d8; border-radius: 12px;
            padding: 28px 32px; max-width: 420px; text-align: center;
            box-shadow: 0 1px 2px rgba(0,0,0,.04); }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    p { margin: 0; color: #666; line-height: 1.5; font-size: .95rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>This link has expired</h1>
    <p>Ask the sender for a new download link. Shared links are temporary and stop working after they expire.</p>
  </div>
</body>
</html>
"""

_INVALID_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Link unavailable</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f7f4f4; color: #1f1f1f;
           display: grid; place-items: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; border: 1px solid #e8d8d8; border-radius: 12px;
            padding: 28px 32px; max-width: 420px; text-align: center;
            box-shadow: 0 1px 2px rgba(0,0,0,.04); }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    p { margin: 0; color: #666; line-height: 1.5; font-size: .95rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>This link is unavailable</h1>
    <p>The download link is invalid or the document is no longer available. Ask the sender for a new link.</p>
  </div>
</body>
</html>
"""

_FILE_GONE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Document no longer available</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f7f4f4; color: #1f1f1f;
           display: grid; place-items: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; border: 1px solid #e8d8d8; border-radius: 12px;
            padding: 28px 32px; max-width: 420px; text-align: center;
            box-shadow: 0 1px 2px rgba(0,0,0,.04); }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    p { margin: 0; color: #666; line-height: 1.5; font-size: .95rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>This document is no longer available</h1>
    <p>The file was lost from temporary server storage. Ask the sender to generate the document again and share a new link.</p>
  </div>
</body>
</html>
"""


@router.get("/health")
def health_check():
    available, engine = pdf_converter_available()
    is_docker = os.path.exists("/.dockerenv")
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0",
        "runtime": "docker" if is_docker else "native",
        "pdf_available": available,
        "pdf_engine": engine if available else None,
        "pdf_unavailable_reason": None if available else engine,
    }


@router.get("/ping")
def ping():
    return {"pong": True}


@router.get("/shared/{token}")
def download_shared_document(token: str, db: Session = Depends(get_db)):
    """
    Public (unauthenticated) PDF download via a time-limited share token.

    Reusable until expires_at. Expired/invalid tokens return a clean HTML page
    (not a raw 404/500). Missing stored files return an honest "no longer available" page.
    """
    raw = (token or "").strip()
    if not raw or len(raw) < 16:
        return HTMLResponse(content=_INVALID_HTML, status_code=410)

    row = (
        db.query(models.DocumentShareToken)
        .filter(models.DocumentShareToken.token == raw)
        .first()
    )
    if not row:
        return HTMLResponse(content=_INVALID_HTML, status_code=410)

    now = datetime.utcnow()
    if row.expires_at <= now:
        return HTMLResponse(content=_EXPIRED_HTML, status_code=410)

    doc = (
        db.query(models.GeneratedDocument)
        .filter(
            models.GeneratedDocument.id == row.generated_document_id,
            models.GeneratedDocument.org_id == row.org_id,
        )
        .first()
    )
    if not doc or not doc.pdf_filename:
        return HTMLResponse(content=_INVALID_HTML, status_code=410)

    try:
        data, media, filename = get_generated_document_bytes(
            stored_path=doc.pdf_filename,
            local_output_dir=OUTPUT_DIR,
            format="pdf",
            document_id=doc.id,
        )
    except GeneratedDocumentStorageError:
        return HTMLResponse(content=_FILE_GONE_HTML, status_code=410)

    return Response(
        content=data,
        media_type=media,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )

"""Platform generated-document persistence via Supabase Storage (sb://).

Reuses logo_storage transport (service-role HTTP). Legacy immigration
generated docs are untouched — this module is for org-scoped platform rows only.

Bucket: generated-documents (auto-created via Storage API when missing; private).
Object keys: {org_id}/{document_id}.docx|pdf
Stored refs (same columns as templates/logos): docx_filename / pdf_filename
  e.g. sb://generated-documents/{org_id}/{document_id}.pdf
"""

from __future__ import annotations

import logging
import os
import urllib.error

from services.logo_storage import (
    SB_PREFIX,
    DOCX_MIME,
    _request,
    ensure_bucket,
    is_remote_path,
    storage_enabled,
)

logger = logging.getLogger(__name__)

GENERATED_BUCKET = "generated-documents"
UNAVAILABLE_DETAIL = (
    "This document is no longer available. "
    "The file was lost from temporary server storage — generate it again."
)


class GeneratedDocumentStorageError(Exception):
    """Raised when upload/read of a generated document fails."""


def ensure_generated_bucket() -> None:
    """Create the private generated-documents bucket if missing (auto via API)."""
    ensure_bucket(GENERATED_BUCKET, public=False)


def remote_object_key(org_id: str, document_id: int, ext: str) -> str:
    ext = ext.lstrip(".")
    return f"{org_id}/{int(document_id)}.{ext}"


def remote_stored_path(org_id: str, document_id: int, ext: str) -> str:
    return f"{SB_PREFIX}{GENERATED_BUCKET}/{remote_object_key(org_id, document_id, ext)}"


def upload_generated_bytes(
    *,
    org_id: str,
    document_id: int,
    ext: str,
    content: bytes,
    content_type: str,
) -> str:
    """
    Upload bytes to Supabase Storage. Returns sb:// reference.

    Raises GeneratedDocumentStorageError on failure (caller must not leave
    a half-persisted GeneratedDocument row).
    """
    if not content:
        raise GeneratedDocumentStorageError("Refusing to upload empty file")
    if not storage_enabled():
        raise GeneratedDocumentStorageError(
            "Supabase Storage is not configured (SUPABASE_URL / SERVICE_ROLE_KEY)"
        )
    ensure_generated_bucket()
    key = remote_object_key(org_id, document_id, ext)
    try:
        _request(
            "POST",
            f"/storage/v1/object/{GENERATED_BUCKET}/{key}",
            data=content,
            headers={
                "Content-Type": content_type,
                "x-upsert": "true",
            },
        )
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            body = str(exc.reason)
        raise GeneratedDocumentStorageError(
            f"Failed to upload generated document to storage ({exc.code}): {body}"
        ) from exc
    except Exception as exc:
        raise GeneratedDocumentStorageError(
            f"Failed to upload generated document to storage: {exc}"
        ) from exc
    return f"{SB_PREFIX}{GENERATED_BUCKET}/{key}"


def delete_generated_remote(stored_path: str | None) -> None:
    """Best-effort delete of a remote object (ignore missing / errors)."""
    if not stored_path or not is_remote_path(stored_path) or not storage_enabled():
        return
    rest = stored_path[len(SB_PREFIX) :]
    if "/" not in rest:
        return
    bucket, key = rest.split("/", 1)
    try:
        _request("DELETE", f"/storage/v1/object/{bucket}/{key}")
    except Exception:
        logger.warning("Could not delete remote generated object %s", stored_path)


def read_generated_bytes(stored_path: str | None, local_output_dir: str) -> bytes | None:
    """Load generated file bytes from sb:// or local OUTPUT_DIR relative path."""
    if not stored_path:
        return None

    if is_remote_path(stored_path):
        if not storage_enabled():
            return None
        rest = stored_path[len(SB_PREFIX) :]
        if "/" not in rest:
            return None
        bucket, key = rest.split("/", 1)
        try:
            # Authenticated object API (bucket is private).
            return _request("GET", f"/storage/v1/object/{bucket}/{key}")
        except urllib.error.HTTPError:
            try:
                return _request("GET", f"/storage/v1/object/public/{bucket}/{key}")
            except urllib.error.HTTPError:
                return None
        except Exception:
            logger.exception("Failed reading generated document %s", stored_path)
            return None

    from fastapi import HTTPException
    from utils.file_utils import safe_join_relative

    try:
        path = safe_join_relative(local_output_dir, stored_path.replace("\\", "/"))
    except HTTPException:
        return None
    if not os.path.exists(path):
        return None
    with open(path, "rb") as fh:
        data = fh.read()
    return data or None


def unlink_local_quiet(path: str | None) -> None:
    if not path:
        return
    try:
        if os.path.exists(path):
            os.unlink(path)
    except OSError:
        logger.warning("Could not remove temp generated file %s", path)


def media_and_ext_for_format(fmt: str) -> tuple[str, str]:
    if fmt == "pdf":
        return "application/pdf", "pdf"
    return (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "docx",
    )


def download_name_for(stored_path: str | None, document_id: int, ext: str) -> str:
    if stored_path and is_remote_path(stored_path):
        return f"document_{document_id}.{ext}"
    if stored_path:
        return os.path.basename(stored_path.replace("\\", "/")) or f"document_{document_id}.{ext}"
    return f"document_{document_id}.{ext}"


def get_generated_document_bytes(
    *,
    stored_path: str | None,
    local_output_dir: str,
    format: str,
    document_id: int | None = None,
    download_basename: str | None = None,
) -> tuple[bytes, str, str]:
    """
    Shared reader for download / share / Telegram / email / in-app PDF viewer.

    Returns (bytes, media_type, filename).
    Raises GeneratedDocumentStorageError with UNAVAILABLE_DETAIL when missing.
    """
    media, ext = media_and_ext_for_format(format)
    data = read_generated_bytes(stored_path, local_output_dir)
    if not data:
        raise GeneratedDocumentStorageError(UNAVAILABLE_DETAIL)
    name = download_basename or download_name_for(
        stored_path, int(document_id or 0), ext
    )
    return data, media, name


def persist_local_generated_pair(
    *,
    org_id: str,
    document_id: int,
    local_docx_path: str,
    local_pdf_path: str | None,
    output_dir: str,
) -> tuple[str, str | None]:
    """
    After local LibreOffice generation: upload to Supabase when configured,
    else keep relative local paths (dev/test only).

    Returns (docx_stored_path, pdf_stored_path|None).
    On remote upload failure raises GeneratedDocumentStorageError; caller
    deletes the DB row and cleans local/remote partials.
    """
    with open(local_docx_path, "rb") as fh:
        docx_bytes = fh.read()
    pdf_bytes = None
    if local_pdf_path and os.path.exists(local_pdf_path):
        with open(local_pdf_path, "rb") as fh:
            pdf_bytes = fh.read()

    if storage_enabled():
        uploaded: list[str] = []
        try:
            docx_ref = upload_generated_bytes(
                org_id=org_id,
                document_id=document_id,
                ext="docx",
                content=docx_bytes,
                content_type=DOCX_MIME,
            )
            uploaded.append(docx_ref)
            pdf_ref = None
            if pdf_bytes:
                pdf_ref = upload_generated_bytes(
                    org_id=org_id,
                    document_id=document_id,
                    ext="pdf",
                    content=pdf_bytes,
                    content_type="application/pdf",
                )
                uploaded.append(pdf_ref)
        except GeneratedDocumentStorageError:
            for ref in uploaded:
                delete_generated_remote(ref)
            raise
        unlink_local_quiet(local_docx_path)
        unlink_local_quiet(local_pdf_path)
        return docx_ref, pdf_ref

    # Dev/test fallback — relative under OUTPUT_DIR
    env = os.getenv("ENVIRONMENT", "development").lower()
    if env == "production":
        raise GeneratedDocumentStorageError(
            "Supabase Storage must be configured in production for generated documents"
        )
    rel_docx = f"orgs/{org_id}/{os.path.basename(local_docx_path)}"
    rel_pdf = (
        f"orgs/{org_id}/{os.path.basename(local_pdf_path)}" if local_pdf_path else None
    )
    return rel_docx, rel_pdf

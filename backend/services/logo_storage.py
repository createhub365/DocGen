import json
import os
import urllib.error
import urllib.request

from utils.file_utils import safe_join

BUCKET = "employer-logos"
THUMBNAIL_BUCKET = "template-thumbnails"
PREVIEW_BUCKET = "template-previews"
TEMPLATE_BUCKET = "template-documents"
ORG_LOGO_BUCKET = "org-logos"
SB_PREFIX = "sb://"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_LOGO_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
}


def _supabase_config() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    return url, key


def storage_enabled() -> bool:
    url, key = _supabase_config()
    return bool(url and key)


def is_remote_path(stored_path: str | None) -> bool:
    return bool(stored_path and stored_path.startswith(SB_PREFIX))


def _parse_stored_path(stored_path: str) -> tuple[str, str]:
    rest = stored_path[len(SB_PREFIX) :]
    if "/" in rest:
        bucket, filename = rest.split("/", 1)
        return bucket, filename
    return BUCKET, rest


def _remote_filename(stored_path: str) -> str:
    return _parse_stored_path(stored_path)[1]


def _request(method: str, path: str, data: bytes | None = None, headers: dict | None = None) -> bytes:
    url, key = _supabase_config()
    if not url or not key:
        raise RuntimeError("Supabase storage is not configured")

    req = urllib.request.Request(
        f"{url}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {key}",
            **(headers or {}),
        },
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()


def ensure_bucket(bucket: str = BUCKET, *, public: bool = True) -> None:
    if not storage_enabled():
        return
    try:
        _request(
            "POST",
            "/storage/v1/bucket",
            data=json.dumps(
                {"id": bucket, "name": bucket, "public": public}
            ).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
    except urllib.error.HTTPError as exc:
        if exc.code not in (400, 409):
            raise


def _save_object(
    bucket: str,
    content: bytes,
    filename: str,
    content_type: str,
    local_dir: str,
) -> str:
    if storage_enabled():
        ensure_bucket(bucket)
        object_path = f"{bucket}/{filename}"
        _request(
            "POST",
            f"/storage/v1/object/{object_path}",
            data=content,
            headers={
                "Content-Type": content_type or "application/octet-stream",
                "x-upsert": "true",
            },
        )
        return f"{SB_PREFIX}{bucket}/{filename}"

    os.makedirs(local_dir, exist_ok=True)
    path = safe_join(local_dir, filename)
    with open(path, "wb") as handle:
        handle.write(content)
    return filename


def save_logo(content: bytes, filename: str, content_type: str, logo_dir: str) -> str:
    stored = _save_object(BUCKET, content, filename, content_type, logo_dir)
    if is_remote_path(stored):
        return stored
    return stored


def delete_logo(stored_path: str | None, logo_dir: str) -> None:
    if not stored_path:
        return

    if is_remote_path(stored_path):
        if not storage_enabled():
            return
        bucket, filename = _parse_stored_path(stored_path)
        object_path = f"{bucket}/{filename}"
        try:
            _request("DELETE", f"/storage/v1/object/{object_path}")
        except urllib.error.HTTPError:
            pass
        return

    path = safe_join(logo_dir, stored_path)
    if os.path.exists(path):
        os.unlink(path)


def public_url_for_stored_path(stored_path: str) -> str | None:
    if not stored_path:
        return None
    if is_remote_path(stored_path):
        url, _ = _supabase_config()
        bucket, filename = _parse_stored_path(stored_path)
        return f"{url}/storage/v1/object/public/{bucket}/{filename}"
    return None


def save_thumbnail(content: bytes, filename: str, thumbnail_dir: str) -> str:
    stored = _save_object(THUMBNAIL_BUCKET, content, filename, "image/png", thumbnail_dir)
    if is_remote_path(stored):
        return stored
    return f"thumbnails/{filename}"


def save_preview_pdf(content: bytes, filename: str, preview_dir: str) -> str:
    """Persist a full-preview PDF locally and/or to Supabase template-previews."""
    stored = _save_object(
        PREVIEW_BUCKET, content, filename, "application/pdf", preview_dir
    )
    if is_remote_path(stored):
        return stored
    return f"previews/{filename}"


def resolve_logo_local_path(stored_path: str | None, logo_dir: str) -> str | None:
    if not stored_path:
        return None

    if is_remote_path(stored_path):
        if not storage_enabled():
            return None
        bucket, filename = _parse_stored_path(stored_path)
        cache_dir = os.path.join(logo_dir, ".cache")
        os.makedirs(cache_dir, exist_ok=True)
        cache_path = safe_join(cache_dir, os.path.basename(filename))
        if not os.path.exists(cache_path):
            data = _request(
                "GET",
                f"/storage/v1/object/public/{bucket}/{filename}",
            )
            with open(cache_path, "wb") as handle:
                handle.write(data)
        return cache_path if os.path.exists(cache_path) else None

    full_path = safe_join(logo_dir, os.path.basename(stored_path))
    return full_path if os.path.exists(full_path) else None


def media_type_for_path(stored_path: str) -> str:
    ext = os.path.splitext(stored_path)[1].lower()
    return _LOGO_MEDIA_TYPES.get(ext, "application/octet-stream")


def read_stored_file_bytes(stored_path: str, local_dir: str) -> tuple[bytes, str] | None:
    """Load file bytes from Supabase or local disk. Returns (bytes, media_type)."""
    if not stored_path:
        return None

    if is_remote_path(stored_path):
        if not storage_enabled():
            return None
        bucket, filename = _parse_stored_path(stored_path)
        try:
            data = _request("GET", f"/storage/v1/object/public/{bucket}/{filename}")
        except urllib.error.HTTPError:
            try:
                data = _request("GET", f"/storage/v1/object/{bucket}/{filename}")
            except urllib.error.HTTPError:
                return None
        return data, media_type_for_path(filename)

    rel_path = stored_path.replace("\\", "/")
    if rel_path.startswith("thumbnails/") or "/" in rel_path:
        from utils.file_utils import safe_join_relative

        full_path = safe_join_relative(local_dir, rel_path)
    else:
        full_path = safe_join(local_dir, os.path.basename(stored_path))

    if not os.path.exists(full_path):
        return None

    with open(full_path, "rb") as handle:
        return handle.read(), media_type_for_path(full_path)


def save_template_docx(content: bytes, filename: str, template_dir: str) -> str:
    safe_name = os.path.basename(filename)
    os.makedirs(template_dir, exist_ok=True)
    local_path = safe_join(template_dir, safe_name)
    with open(local_path, "wb") as handle:
        handle.write(content)
    if storage_enabled():
        ensure_bucket(TEMPLATE_BUCKET)
        object_path = f"{TEMPLATE_BUCKET}/{safe_name}"
        _request(
            "POST",
            f"/storage/v1/object/{object_path}",
            data=content,
            headers={
                "Content-Type": DOCX_MIME,
                "x-upsert": "true",
            },
        )
    return safe_name


def save_org_logo(
    content: bytes,
    relative_path: str,
    content_type: str,
    template_root: str,
) -> str:
    """
    Persist an org logo under template_root/orgs/{org_id}/….

    relative_path must be org-scoped (orgs/{org_id}/logo_….ext).
    Remote objects use the dedicated org-logos bucket with a flat key
    (template-documents rejects image MIME types → 400).
    Returns relative_path (local) or sb://org-logos/{flat_key}.
    """
    from utils.file_utils import safe_join_relative

    rel = (relative_path or "").replace("\\", "/").lstrip("/")
    parts = rel.split("/")
    if len(parts) < 3 or parts[0] != "orgs" or ".." in parts:
        raise ValueError("org logo path must be under orgs/{org_id}/")
    org_id = parts[1]
    basename = parts[-1]
    if not basename.startswith("logo_"):
        raise ValueError("org logo basename must start with logo_")

    full = safe_join_relative(template_root, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as handle:
        handle.write(content)

    if not storage_enabled():
        return rel

    # Flat key keeps org scope without nested Storage paths.
    remote_name = f"org_logo_{org_id}_{basename}"
    try:
        ensure_bucket(ORG_LOGO_BUCKET)
        _request(
            "POST",
            f"/storage/v1/object/{ORG_LOGO_BUCKET}/{remote_name}",
            data=content,
            headers={
                "Content-Type": content_type or "application/octet-stream",
                "x-upsert": "true",
            },
        )
        return f"{SB_PREFIX}{ORG_LOGO_BUCKET}/{remote_name}"
    except urllib.error.HTTPError as exc:
        # Local file is already written; keep serving from disk rather than 500.
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        import logging

        logging.getLogger(__name__).warning(
            "org logo remote upload failed (%s): %s — using local path",
            exc.code,
            body or exc.reason,
        )
        return rel


def delete_org_logo(stored_path: str | None, template_root: str) -> None:
    """Best-effort remove of an org logo from local disk and Supabase."""
    if not stored_path:
        return

    if is_remote_path(stored_path):
        if not storage_enabled():
            return
        bucket, filename = _parse_stored_path(stored_path)
        try:
            _request("DELETE", f"/storage/v1/object/{bucket}/{filename}")
        except urllib.error.HTTPError:
            pass
        except Exception:
            pass
        return

    try:
        from utils.file_utils import safe_join_relative

        rel = str(stored_path).replace("\\", "/")
        local = safe_join_relative(template_root, rel)
        if os.path.exists(local):
            os.unlink(local)
    except Exception:
        pass

    # Also try flat remote key derived from local relative path.
    if storage_enabled():
        rel = str(stored_path).replace("\\", "/")
        parts = rel.split("/")
        if len(parts) >= 3 and parts[0] == "orgs":
            remote_name = f"org_logo_{parts[1]}_{parts[-1]}"
            try:
                _request(
                    "DELETE",
                    f"/storage/v1/object/{ORG_LOGO_BUCKET}/{remote_name}",
                )
            except urllib.error.HTTPError:
                pass
            except Exception:
                pass


def delete_template_docx(stored_path: str | None, template_dir: str) -> None:
    """Best-effort remove of a template .docx from local disk and Supabase."""
    if not stored_path:
        return
    safe_name = os.path.basename(str(stored_path).replace("\\", "/"))
    if not safe_name:
        return

    # Local org path (TEMPLATE_DIR/orgs/{org}/file.docx) or flat dir
    try:
        from utils.file_utils import safe_join_relative

        rel = str(stored_path).replace("\\", "/")
        if rel.startswith("orgs/"):
            local = safe_join_relative(template_dir, rel)
        else:
            local = safe_join(template_dir, safe_name)
        if os.path.exists(local):
            os.unlink(local)
    except Exception:
        pass

    cache_path = safe_join(os.path.join(template_dir, ".cache"), safe_name)
    if os.path.exists(cache_path):
        try:
            os.unlink(cache_path)
        except OSError:
            pass

    if storage_enabled():
        try:
            _request("DELETE", f"/storage/v1/object/{TEMPLATE_BUCKET}/{safe_name}")
        except urllib.error.HTTPError:
            pass
        except Exception:
            pass


def resolve_template_local_path(filename: str | None, template_dir: str) -> str | None:
    if not filename:
        return None

    safe_name = os.path.basename(filename)
    os.makedirs(template_dir, exist_ok=True)
    local_path = safe_join(template_dir, safe_name)
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        return local_path

    if not storage_enabled():
        return None

    cache_dir = os.path.join(template_dir, ".cache")
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = safe_join(cache_dir, safe_name)
    if os.path.exists(cache_path) and os.path.getsize(cache_path) > 0:
        return cache_path

    try:
        data = _request("GET", f"/storage/v1/object/public/{TEMPLATE_BUCKET}/{safe_name}")
    except urllib.error.HTTPError:
        try:
            data = _request("GET", f"/storage/v1/object/{TEMPLATE_BUCKET}/{safe_name}")
        except urllib.error.HTTPError:
            return None

    with open(cache_path, "wb") as handle:
        handle.write(data)
    return cache_path if os.path.exists(cache_path) and os.path.getsize(cache_path) > 0 else None


def public_template_url(filename: str | None) -> str | None:
    if not filename or not storage_enabled():
        return None
    url, _ = _supabase_config()
    safe_name = os.path.basename(filename)
    return f"{url}/storage/v1/object/public/{TEMPLATE_BUCKET}/{safe_name}"

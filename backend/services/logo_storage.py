import json
import os
import urllib.error
import urllib.request

from utils.file_utils import safe_join

BUCKET = "employer-logos"
THUMBNAIL_BUCKET = "template-thumbnails"
TEMPLATE_BUCKET = "template-documents"
SB_PREFIX = "sb://"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_LOGO_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
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


def ensure_bucket(bucket: str = BUCKET) -> None:
    if not storage_enabled():
        return
    try:
        _request(
            "POST",
            "/storage/v1/bucket",
            data=json.dumps({"id": bucket, "name": bucket, "public": True}).encode("utf-8"),
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

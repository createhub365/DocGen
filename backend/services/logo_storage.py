import json
import os
import urllib.error
import urllib.request

from utils.file_utils import safe_join

BUCKET = "employer-logos"
SB_PREFIX = "sb://"
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


def _remote_filename(stored_path: str) -> str:
    return stored_path[len(SB_PREFIX) :]


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


def ensure_bucket() -> None:
    if not storage_enabled():
        return
    try:
        _request(
            "POST",
            "/storage/v1/bucket",
            data=json.dumps({"id": BUCKET, "name": BUCKET, "public": True}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
    except urllib.error.HTTPError as exc:
        if exc.code not in (400, 409):
            raise


def save_logo(content: bytes, filename: str, content_type: str, logo_dir: str) -> str:
    if storage_enabled():
        ensure_bucket()
        object_path = f"{BUCKET}/{filename}"
        _request(
            "POST",
            f"/storage/v1/object/{object_path}",
            data=content,
            headers={
                "Content-Type": content_type or "application/octet-stream",
                "x-upsert": "true",
            },
        )
        return f"{SB_PREFIX}{filename}"

    os.makedirs(logo_dir, exist_ok=True)
    path = safe_join(logo_dir, filename)
    with open(path, "wb") as handle:
        handle.write(content)
    return filename


def delete_logo(stored_path: str | None, logo_dir: str) -> None:
    if not stored_path:
        return

    if is_remote_path(stored_path):
        if not storage_enabled():
            return
        object_path = f"{BUCKET}/{_remote_filename(stored_path)}"
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
        filename = _remote_filename(stored_path)
        return f"{url}/storage/v1/object/public/{BUCKET}/{filename}"
    return None


def resolve_logo_local_path(stored_path: str | None, logo_dir: str) -> str | None:
    if not stored_path:
        return None

    if is_remote_path(stored_path):
        if not storage_enabled():
            return None
        filename = _remote_filename(stored_path)
        cache_dir = os.path.join(logo_dir, ".cache")
        os.makedirs(cache_dir, exist_ok=True)
        cache_path = safe_join(cache_dir, filename)
        if not os.path.exists(cache_path):
            data = _request(
                "GET",
                f"/storage/v1/object/public/{BUCKET}/{filename}",
            )
            with open(cache_path, "wb") as handle:
                handle.write(data)
        return cache_path if os.path.exists(cache_path) else None

    full_path = safe_join(logo_dir, os.path.basename(stored_path))
    return full_path if os.path.exists(full_path) else None


def media_type_for_path(stored_path: str) -> str:
    ext = os.path.splitext(stored_path)[1].lower()
    return _LOGO_MEDIA_TYPES.get(ext, "application/octet-stream")

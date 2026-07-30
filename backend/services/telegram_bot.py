"""Shared platform Telegram bot (TELEGRAM_BOT_TOKEN — never org-specific)."""

from __future__ import annotations

import logging
import os
from typing import BinaryIO

import httpx

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org"


def telegram_bot_configured() -> bool:
    return bool(os.getenv("TELEGRAM_BOT_TOKEN", "").strip())


def send_document(
    *,
    chat_id: str,
    filename: str,
    file_bytes: bytes | BinaryIO,
    caption: str | None = None,
    timeout: float = 60.0,
) -> dict:
    """
    Upload a file via Bot API sendDocument using the shared platform token.

    Raises ValueError for config/API errors with a user-safe message.
    """
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        raise ValueError("Telegram bot is not configured on this server")
    if not chat_id or not str(chat_id).strip():
        raise ValueError("Telegram chat_id is required")

    url = f"{TELEGRAM_API_BASE}/bot{token}/sendDocument"
    data: dict[str, str] = {"chat_id": str(chat_id).strip()}
    if caption:
        data["caption"] = caption[:1024]

    if hasattr(file_bytes, "read"):
        content = file_bytes.read()
    else:
        content = file_bytes

    files = {"document": (filename or "document.pdf", content, "application/pdf")}

    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, data=data, files=files)
    except httpx.HTTPError as exc:
        logger.exception("Telegram sendDocument network error")
        raise ValueError("Could not reach Telegram. Try again later.") from exc

    try:
        payload = resp.json()
    except Exception:
        payload = {}

    if resp.status_code >= 400 or not payload.get("ok"):
        description = (
            (payload.get("description") if isinstance(payload, dict) else None)
            or f"Telegram API error ({resp.status_code})"
        )
        logger.warning(
            "Telegram sendDocument failed chat_id=%s status=%s detail=%s",
            chat_id,
            resp.status_code,
            description,
        )
        raise ValueError(str(description))

    return payload

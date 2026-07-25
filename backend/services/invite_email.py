"""Outbound invite email via stdlib smtplib (optional SMTP_* env)."""

from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger(__name__)


def smtp_configured() -> bool:
    return bool(os.getenv("SMTP_HOST", "").strip() and os.getenv("SMTP_FROM", "").strip())


def send_invite_email(
    *,
    to_email: str,
    username: str,
    temporary_password: str | None,
    org_name: str | None = None,
    login_url: str | None = None,
) -> bool:
    """
    Best-effort invite email. Returns True on send success, False otherwise.
    Never raises — callers must not treat email as required for invite success.
    """
    if not to_email or not smtp_configured():
        if not smtp_configured():
            logger.info("Invite email skipped: SMTP_HOST/SMTP_FROM not configured")
        return False

    host = os.getenv("SMTP_HOST", "").strip()
    port = int(os.getenv("SMTP_PORT", "587") or "587")
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    mail_from = os.getenv("SMTP_FROM", "").strip()
    use_tls = os.getenv("SMTP_TLS", "true").lower() not in ("0", "false", "no")
    login_url = (login_url or os.getenv("PLATFORM_LOGIN_URL", "")).strip() or (
        "https://docgen.createhub365.workers.dev/platform/login"
    )

    subject = "You're invited to DocGen Pro"
    org_bit = f" for {org_name}" if org_name else ""
    lines = [
        f"You have been invited{org_bit} on DocGen Pro.",
        "",
        f"Username: {username}",
    ]
    if temporary_password:
        lines.append(f"Temporary password: {temporary_password}")
        lines.append("")
        lines.append("Please sign in and change your password after first login.")
    else:
        lines.append("")
        lines.append("Use your existing account password to sign in.")
    lines.extend(["", f"Login: {login_url}", ""])
    body = "\n".join(lines)

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = mail_from
    msg["To"] = to_email
    msg.set_content(body)

    try:
        with smtplib.SMTP(host, port, timeout=20) as smtp:
            if use_tls:
                smtp.starttls()
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
        logger.info("Invite email sent to %s", to_email)
        return True
    except Exception:
        logger.exception("Invite email failed for %s (invite still succeeds)", to_email)
        return False

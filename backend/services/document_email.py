"""Send generated document PDFs as real email attachments via SMTP_*.

Unlike invite email (soft-fail / never raise), document send MUST surface
failures to the caller — sending is the whole point of the action.
"""

from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage

from services.invite_email import smtp_configured

logger = logging.getLogger(__name__)


def send_document_email(
    *,
    to_email: str,
    subject: str,
    body: str,
    filename: str,
    pdf_bytes: bytes,
) -> None:
    """
    Send an email with a PDF attachment.

    Raises ValueError with a clear message when SMTP is missing or send fails.
    """
    to_email = (to_email or "").strip()
    if not to_email or "@" not in to_email:
        raise ValueError("A valid recipient email is required")
    if not smtp_configured():
        raise ValueError(
            "Email is not configured on this server (SMTP_HOST / SMTP_FROM)."
        )
    if not pdf_bytes:
        raise ValueError("PDF file is empty or unavailable")

    host = os.getenv("SMTP_HOST", "").strip()
    port = int(os.getenv("SMTP_PORT", "587") or "587")
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    mail_from = os.getenv("SMTP_FROM", "").strip()
    use_tls = os.getenv("SMTP_TLS", "true").lower() not in ("0", "false", "no")

    msg = EmailMessage()
    msg["Subject"] = subject or "Document from DocGen Pro"
    msg["From"] = mail_from
    msg["To"] = to_email
    msg.set_content(body or "Please find the attached document.")

    msg.add_attachment(
        pdf_bytes,
        maintype="application",
        subtype="pdf",
        filename=filename or "document.pdf",
    )

    try:
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            if use_tls:
                smtp.starttls()
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
        logger.info("Document email sent to %s", to_email)
    except Exception as exc:
        logger.exception("Document email failed for %s", to_email)
        raise ValueError(
            "Failed to send email. Check SMTP settings and try again."
        ) from exc

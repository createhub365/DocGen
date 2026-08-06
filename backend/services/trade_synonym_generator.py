"""Generate org-trade synonyms via Groq (OpenAI-compatible chat API).

Uses httpx (already in requirements) — no openai SDK dependency.
Reads GROQ_API_KEY / GROQ_MODEL from env; never exposes the key to clients.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

GROQ_API_BASE = "https://api.groq.com/openai/v1"
# Free-tier workhorse: highest RPD among current Groq free models (see Groq rate limits).
DEFAULT_GROQ_MODEL = "llama-3.1-8b-instant"
BATCH_SIZE = 15
# Free tier ~6k TPM for this model — ~12s between batches keeps us under TPM/RPM.
INTER_BATCH_DELAY_SEC = 12.0
MAX_RETRIES_ON_429 = 4
REQUEST_TIMEOUT_SEC = 60.0
DUTIES_SNIPPET_CHARS = 180


class GroqNotConfiguredError(ValueError):
    """Raised when GROQ_API_KEY is missing — map to a clear API error."""


def groq_configured() -> bool:
    return bool(os.getenv("GROQ_API_KEY", "").strip())


def _model_name() -> str:
    return (os.getenv("GROQ_MODEL") or DEFAULT_GROQ_MODEL).strip() or DEFAULT_GROQ_MODEL


def _normalize_synonyms(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        items = [p.strip() for p in raw.split(",")]
    elif isinstance(raw, list):
        items = [str(p).strip() for p in raw]
    else:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if not item:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def trade_has_synonyms(row: Any) -> bool:
    return bool(_normalize_synonyms(getattr(row, "synonyms", None)))


def _duties_snippet(text: str | None) -> str:
    raw = (text or "").strip().replace("\n", " ")
    if len(raw) <= DUTIES_SNIPPET_CHARS:
        return raw
    return raw[: DUTIES_SNIPPET_CHARS - 1] + "…"


def _extract_json_object(content: str) -> dict:
    text = (content or "").strip()
    if not text:
        raise ValueError("empty model response")
    # Prefer fenced JSON if present
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL | re.IGNORECASE)
    if fence:
        text = fence.group(1)
    else:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start : end + 1]
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("JSON root is not an object")
    return data


def _parse_synonym_map(payload: dict, expected_names: list[str]) -> dict[str, list[str]]:
    """
    Accept either {"synonyms": {name: [...]}} or a flat {name: [...]} map.
    Keys matched case-insensitively to expected trade names.
    """
    root = payload.get("synonyms") if isinstance(payload.get("synonyms"), dict) else payload
    if not isinstance(root, dict):
        raise ValueError("synonyms map missing")

    by_lower = {str(k).strip().lower(): v for k, v in root.items() if str(k).strip()}
    out: dict[str, list[str]] = {}
    for name in expected_names:
        raw = by_lower.get(name.lower())
        if raw is None:
            continue
        syns = _normalize_synonyms(raw)
        # Drop synonyms that equal the trade name itself
        syns = [s for s in syns if s.lower() != name.lower()]
        if syns:
            out[name] = syns[:6]
    return out


def _chat_completions(messages: list[dict], *, attempt: int = 0) -> str:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        raise GroqNotConfiguredError(
            "AI synonym generation is not configured (GROQ_API_KEY)."
        )

    url = f"{GROQ_API_BASE}/chat/completions"
    body = {
        "model": _model_name(),
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT_SEC) as client:
            resp = client.post(url, headers=headers, json=body)
    except httpx.HTTPError as exc:
        logger.exception("Groq network error")
        raise ValueError("Could not reach Groq. Try again later.") from exc

    if resp.status_code == 429:
        if attempt >= MAX_RETRIES_ON_429:
            raise ValueError("Groq rate limit exceeded after retries")
        retry_after = resp.headers.get("retry-after")
        try:
            wait = float(retry_after) if retry_after else min(60.0, 2.0 ** (attempt + 2))
        except ValueError:
            wait = min(60.0, 2.0 ** (attempt + 2))
        logger.warning("Groq 429 — sleeping %.1fs (attempt %s)", wait, attempt + 1)
        time.sleep(wait)
        return _chat_completions(messages, attempt=attempt + 1)

    if resp.status_code >= 400:
        detail = (resp.text or "")[:300]
        logger.warning("Groq API error status=%s detail=%s", resp.status_code, detail)
        raise ValueError(f"Groq API error ({resp.status_code})")

    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise ValueError("Unexpected Groq response shape") from exc
    return content if isinstance(content, str) else str(content)


def generate_synonyms_for_batch(
    trades: list[dict[str, Any]],
) -> tuple[dict[int, list[str]], list[dict[str, Any]]]:
    """
    Call Groq for one batch of trades.

    trades: [{id, name, duties_text}, ...]
    Returns (updates_by_id, failed_items).
    """
    if not trades:
        return {}, []

    expected_names = [t["name"] for t in trades]
    payload_trades = [
        {
            "name": t["name"],
            "duties": _duties_snippet(t.get("duties_text")),
        }
        for t in trades
    ]

    system = (
        "You generate alternate job-title synonyms for immigration document forms. "
        "Return STRICT JSON only with this shape: "
        '{"synonyms": {"Exact Trade Name": ["alt1", "alt2", "alt3"]}}. '
        "For each trade provide 3 to 6 short alternate titles people might search. "
        "Use the exact trade name string as the key. No explanations."
    )
    user = (
        "Generate synonyms for these trades:\n"
        + json.dumps(payload_trades, ensure_ascii=False)
    )

    try:
        content = _chat_completions(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ]
        )
        parsed = _extract_json_object(content)
        by_name = _parse_synonym_map(parsed, expected_names)
    except GroqNotConfiguredError:
        raise
    except Exception as exc:
        logger.warning("Groq batch failed: %s", exc)
        reason = str(exc) or "batch failed"
        return {}, [
            {
                "trade_id": int(t["id"]),
                "name": t["name"],
                "reason": reason,
            }
            for t in trades
        ]

    updates: dict[int, list[str]] = {}
    failed: list[dict[str, Any]] = []
    for t in trades:
        syns = by_name.get(t["name"])
        if syns:
            updates[int(t["id"])] = syns
        else:
            failed.append(
                {
                    "trade_id": int(t["id"]),
                    "name": t["name"],
                    "reason": "no synonyms returned for this trade",
                }
            )
    return updates, failed


def generate_synonyms_for_trades(
    trades: list[Any],
    *,
    batch_size: int = BATCH_SIZE,
    inter_batch_delay_sec: float = INTER_BATCH_DELAY_SEC,
) -> tuple[dict[int, list[str]], list[dict[str, Any]]]:
    """
    Batch Groq calls for a list of ORM (or duck-typed) trade rows.

    Skips nothing here — caller filters empty-synonym trades.
    """
    if not groq_configured():
        raise GroqNotConfiguredError(
            "AI synonym generation is not configured (GROQ_API_KEY)."
        )

    items = [
        {
            "id": int(t.id),
            "name": (t.name or "").strip(),
            "duties_text": t.duties_text or "",
        }
        for t in trades
        if (getattr(t, "name", None) or "").strip()
    ]

    all_updates: dict[int, list[str]] = {}
    all_failed: list[dict[str, Any]] = []

    for i in range(0, len(items), batch_size):
        if i > 0 and inter_batch_delay_sec > 0:
            time.sleep(inter_batch_delay_sec)
        batch = items[i : i + batch_size]
        updates, failed = generate_synonyms_for_batch(batch)
        all_updates.update(updates)
        all_failed.extend(failed)

    return all_updates, all_failed


def generate_full_trade_entry(
    *,
    name: str,
    industry_name: str,
) -> dict[str, Any]:
    """
    Ask Groq for duties_text + synonyms for a new trade title.

    Returns {"duties_text": str, "synonyms": list[str]}.
    Raises GroqNotConfiguredError or ValueError on failure / malformed output.
    Does not persist — caller reviews then saves.
    """
    trade_name = (name or "").strip()
    industry = (industry_name or "").strip()
    if not trade_name:
        raise ValueError("name is required")
    if not industry:
        raise ValueError("industry is required")

    if not groq_configured():
        raise GroqNotConfiguredError(
            "AI synonym generation is not configured (GROQ_API_KEY)."
        )

    system = (
        "You write immigration / skilled-migration job descriptions for a Trade Bank. "
        "Return STRICT JSON only with this exact shape: "
        '{"duties_text": "...", "synonyms": ["alt1", "alt2", "alt3"]}. '
        "duties_text: 4 to 8 short responsibility lines separated by newline characters, "
        "imperative/professional tone similar to: "
        "'Carry out core <role> tasks as directed by work orders, specifications, "
        "and supervisor instructions.' "
        "Include role-specific practical duties, quality/compliance, and safe use of tools "
        "where appropriate. No bullet markers, no numbering, no markdown. "
        "synonyms: 3 to 6 short alternate job titles people might type when searching "
        "(not the exact trade name). No explanations."
    )
    user = json.dumps(
        {
            "industry": industry,
            "trade_name": trade_name,
            "instruction": (
                f"Generate duties_text and synonyms for the job title "
                f'"{trade_name}" in the "{industry}" industry.'
            ),
        },
        ensure_ascii=False,
    )

    content = _chat_completions(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
    )
    try:
        parsed = _extract_json_object(content)
    except Exception as exc:
        raise ValueError("AI response was not valid JSON") from exc

    duties_raw = parsed.get("duties_text")
    if not isinstance(duties_raw, str):
        raise ValueError("AI response missing duties_text")
    duties_text = duties_raw.replace("\r\n", "\n").strip()
    # Normalize bullet-ish prefixes if the model adds them anyway
    lines = []
    for line in duties_text.split("\n"):
        cleaned = re.sub(r"^[\s\-•*]+", "", line).strip()
        if cleaned:
            lines.append(cleaned)
    duties_text = "\n".join(lines)
    if len(duties_text) < 40 or len(lines) < 2:
        raise ValueError("AI response duties_text too short or empty")

    syns = _normalize_synonyms(parsed.get("synonyms"))
    syns = [s for s in syns if s.lower() != trade_name.lower()][:6]
    if len(syns) < 2:
        raise ValueError("AI response synonyms missing or incomplete")

    return {"duties_text": duties_text, "synonyms": syns}


def suggest_industry_trade_names(
    *,
    industry_name: str,
    count: int = 30,
) -> list[str]:
    """
    Ask Groq for a best-effort list of common trade/job titles in an industry.

    Returns unique trimmed names (no duties). Raises GroqNotConfiguredError /
    ValueError on failure.
    """
    industry = (industry_name or "").strip()
    if not industry:
        raise ValueError("industry is required")
    n = max(1, min(int(count), 50))

    if not groq_configured():
        raise GroqNotConfiguredError(
            "AI synonym generation is not configured (GROQ_API_KEY)."
        )

    system = (
        "You list common skilled / trade job titles used in immigration and "
        "employment paperwork. Return STRICT JSON only: "
        '{"trades": ["Title One", "Title Two"]}. '
        "Titles should be realistic occupation names (not duties). "
        "No numbering, no explanations, no duplicates."
    )
    user = json.dumps(
        {
            "industry": industry,
            "count": n,
            "instruction": (
                f"Suggest about {n} common job-title trades for the "
                f'"{industry}" industry. Prefer widely recognized titles.'
            ),
        },
        ensure_ascii=False,
    )

    content = _chat_completions(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
    )
    try:
        parsed = _extract_json_object(content)
    except Exception as exc:
        raise ValueError("AI response was not valid JSON") from exc

    raw = parsed.get("trades")
    if not isinstance(raw, list):
        raise ValueError("AI response missing trades list")

    seen: set[str] = set()
    out: list[str] = []
    for item in raw:
        name = str(item or "").strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
        if len(out) >= n:
            break
    if len(out) < 3:
        raise ValueError("AI response trades list too short or empty")
    return out

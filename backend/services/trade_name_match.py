"""Trade-name / synonym similarity for Trade Bank existence checks.

Reuses the same conservative algorithm as placeholder_mapping fuzzy
duplicate detection (normalized containment + tiered Levenshtein),
adapted to score query vs trade name and synonyms.
"""

from __future__ import annotations

import re
from typing import Any, Literal, Optional


MatchedOn = Literal["name", "synonym"]


def normalize_for_similarity(key: str) -> str:
    """Lowercase alphanumerics only — strips punctuation/spaces for fuzzy compare."""
    return re.sub(r"[^a-z0-9]", "", (key or "").lower())


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i]
        for j, cb in enumerate(b, start=1):
            ins = curr[j - 1] + 1
            delete = prev[j] + 1
            sub = prev[j - 1] + (0 if ca == cb else 1)
            curr.append(min(ins, delete, sub))
        prev = curr
    return prev[-1]


def texts_are_similar(query: str, candidate: str) -> bool:
    """
    Same tiers as placeholder_mapping._similar_existing_keys:
    - normalized containment with shorter length >= 4
    - edit distance 1 (len<=8), 2 (len<=16), or <=3 with ratio <=0.2
    Exact normalized equality also counts as similar (used for synonym hits).
    """
    cand = normalize_for_similarity(query)
    exist = normalize_for_similarity(candidate)
    if not cand or not exist:
        return False
    if cand == exist:
        return True
    shorter, longer = (cand, exist) if len(cand) <= len(exist) else (exist, cand)
    if len(shorter) >= 4 and shorter in longer:
        return True
    dist = levenshtein(cand, exist)
    max_len = max(len(cand), len(exist))
    if max_len <= 8 and dist <= 1:
        return True
    if max_len <= 16 and dist <= 2:
        return True
    if dist <= 3 and (dist / max_len) <= 0.2:
        return True
    return False


def match_trade_against_query(
    query: str, trade: Any
) -> Optional[MatchedOn]:
    """
    Return matched_on for a non-exact similar hit, or None.
    Prefer 'name' over 'synonym' when both match.
    """
    name = str(getattr(trade, "name", "") or "")
    if texts_are_similar(query, name):
        return "name"
    synonyms = getattr(trade, "synonyms", None) or []
    if isinstance(synonyms, str):
        synonyms = [synonyms]
    for syn in synonyms:
        if texts_are_similar(query, str(syn)):
            return "synonym"
    return None

"""Shared text helpers for skills (ported from the Node processText)."""

from __future__ import annotations

import re


def process_text(original: str, command_patterns: list[str]) -> str:
    """Strip command phrasing, leaving the query (city/country/etc.)."""
    text = (original or "").lower()
    for pattern in command_patterns:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE)
    text = text.strip()
    text = re.sub(r"[?.!]+$", "", text)
    if text.startswith("in "):
        text = text[3:].strip()
    elif text == "in":
        text = ""
    if text.startswith("the "):
        text = text[4:].strip()
    return text.strip()


def normalize_for_match(text: str) -> str:
    text = (text or "").lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()

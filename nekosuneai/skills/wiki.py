"""Wikipedia + Fandom lookups (ported from WikipediaRest.js / FandomRest.js)."""

from __future__ import annotations

import re
import urllib.parse

import requests

from ..logutil import log


def _clean_wikitext(text: str) -> str:
    text = re.sub(r"\{\{[^}]+\}\}", "", text)
    text = re.sub(r"\[\[File:[^\]]+\]\]", "", text)
    text = re.sub(r"\[\[Category:[^\]]+\]\]", "", text)
    text = re.sub(r"\[\[([^|\]]+\|)?([^\]]+)\]\]", r"\2", text)
    text = re.sub(r"''+", "", text)
    text = re.sub(r"={2,}\s*(.*?)\s*={2,}", r"\n\1\n", text)
    text = re.sub(r"</?u>", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _fetch_rest_page(base: str, query: str, source_name: str) -> str:
    url = f"{base}/rest.php/v1/page/{urllib.parse.quote(query)}"
    try:
        res = requests.get(url, timeout=20)
        if not res.ok:
            raise RuntimeError(f"{source_name} REST error: {res.status_code}")
        data = res.json()
    except Exception as exc:
        log(f"[{source_name}] error:", exc)
        return f"Error fetching from {source_name}."
    if not data or not data.get("source"):
        return f"No content found on {source_name}."
    return _clean_wikitext(data["source"])


def wikipedia(query: str) -> str:
    return _fetch_rest_page("https://en.wikipedia.org", query, "Wikipedia")


def fandom(query: str) -> str:
    return _fetch_rest_page("https://vrchat-legends.fandom.com", query, "VRChat-Legends Fandom")

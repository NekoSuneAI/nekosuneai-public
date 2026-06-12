"""Web search via SearxNG (ported from SearxngRest.js) with safety blocklist."""

from __future__ import annotations

import urllib.parse

import requests

from ..logutil import log
from ._textproc import normalize_for_match


def _matches_blocklist(query: str, blocklist: list[str]) -> bool:
    normalized = normalize_for_match(query)
    for term in blocklist or []:
        nt = normalize_for_match(term)
        if nt and nt in normalized:
            return True
    return False


def _trim_snippet(text: str, max_len: int = 280) -> str:
    cleaned = " ".join((text or "").split())
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1] + "…"


def searxng(query: str, cfg: dict) -> dict:
    """Returns {"results": [...]} | {"blocked": True} | {"error": str}."""
    blocklist = cfg.get("blocklist", [])
    if _matches_blocklist(query, blocklist):
        return {"blocked": True}
    base = (cfg.get("base_url") or "").rstrip("/")
    if not base:
        return {"error": "Web search isn't configured."}
    max_results = int(cfg.get("max_results", 5))
    url = f"{base}/search?q={urllib.parse.quote(query)}&format=json"
    try:
        res = requests.get(url, timeout=20)
        if not res.ok:
            return {"error": f"Search error: {res.status_code}"}
        data = res.json()
    except Exception as exc:
        log("[Search] error:", exc)
        return {"error": "Error reaching the search server."}
    results = data.get("results") if isinstance(data, dict) else None
    results = results if isinstance(results, list) else []
    trimmed = [
        {
            "title": r.get("title") or "Untitled",
            "snippet": _trim_snippet(r.get("content") or r.get("snippet") or r.get("description") or ""),
        }
        for r in results[: max(1, max_results)]
    ]
    return {"results": trimmed}


def build_search_prompt(query: str, results: list[dict]) -> str:
    lines = []
    for i, r in enumerate(results, start=1):
        parts = [f"{i}. {r['title']}"]
        if r.get("snippet"):
            parts.append(r["snippet"])
        lines.append("\n".join(parts))
    return "\n".join(
        [
            "You are given web search results. Use them to answer the user's question.",
            "Cite sources as [1], [2], etc. If results aren't enough, say so.",
            "Only state confirmed facts and mention uncertainty for sensitive claims.",
            "",
            f'User question: "{query}"',
            "",
            "Search results:",
            "\n\n".join(lines),
        ]
    )

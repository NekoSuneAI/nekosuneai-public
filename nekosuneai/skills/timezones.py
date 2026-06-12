"""Time / timezone lookup (ported from Timezones.js).

Uses the bundled ``config/timezone.json`` (country -> IANA timezone) and
Python's ``zoneinfo`` to format the current local time there.
"""

from __future__ import annotations

import datetime
import json
import os

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover - py<3.9
    ZoneInfo = None  # type: ignore

from ._textproc import normalize_for_match, process_text

PKG_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_DIR = os.path.dirname(PKG_DIR)
TZ_PATH = os.path.join(ROOT_DIR, "config", "timezone.json")

_COMMAND_PATTERNS = [
    r"what is time in",
    r"what is time at",
    r"what is the time like in",
    r"what is the time like",
    r"what time is it in",
    r"what time is it",
]

_zones: list[dict] | None = None


def _load_zones() -> list[dict]:
    global _zones
    if _zones is None:
        try:
            with open(TZ_PATH, "r", encoding="utf-8") as fh:
                _zones = json.load(fh)
        except Exception:
            _zones = []
    return _zones


def _find_country(name: str) -> dict | None:
    lower = name.lower()
    for entry in _load_zones():
        if str(entry.get("countryName", "")).lower() == lower:
            return entry
    # Fall back to substring match on the longest country name.
    normalized = normalize_for_match(name)
    best = None
    for entry in _load_zones():
        cname = normalize_for_match(entry.get("countryName", ""))
        if cname and cname in normalized:
            if best is None or len(cname) > len(normalize_for_match(best.get("countryName", ""))):
                best = entry
    return best


def time_lookup(text: str) -> dict:
    query = process_text(text, _COMMAND_PATTERNS)
    if not query:
        return {"error": "Which place's time would you like?"}
    country = _find_country(query)
    if not country or not country.get("timeZone"):
        return {"error": f"I couldn't find a time zone for {query}."}
    if ZoneInfo is None:
        return {"error": "Timezone support is unavailable on this Python."}
    now = datetime.datetime.now(ZoneInfo(country["timeZone"]))
    ampm = now.strftime("%I:%M %p").lstrip("0")
    return {"ampm": ampm, "time": now.strftime("%H:%M"), "location": country["countryName"]}

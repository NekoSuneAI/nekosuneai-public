"""New Year countdown (ported from NewYear.js).

Counts down to Jan 1 of the next year in the requested country's timezone,
or the local timezone if none is given.
"""

from __future__ import annotations

import datetime

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore

from .timezones import _find_country
from ._textproc import process_text

_COMMAND_PATTERNS = [
    r"how many hours (are|is) (left )?(until|till|for) new year'?s?",
    r"how long (until|till) new year'?s?",
    r"new year'?s? countdown",
    r"new year'?s? in",
    r"new year'?s?",
    r"new years",
    r"new year",
]


def newyear_countdown(text: str) -> dict:
    query = process_text(text, _COMMAND_PATTERNS)
    tz_name = None
    location = query
    if query:
        country = _find_country(query)
        if country and country.get("timeZone"):
            tz_name = country["timeZone"]
            location = country["countryName"]
        else:
            return {"error": f"I couldn't find a time zone for {query}."}
    if not tz_name:
        tz_name = "UTC"
        location = "your area"
    if ZoneInfo is None:
        return {"error": "Timezone support is unavailable on this Python."}

    tz = ZoneInfo(tz_name)
    now = datetime.datetime.now(tz)
    target_year = now.year + 1
    target = datetime.datetime(target_year, 1, 1, 0, 0, 0, tzinfo=tz)
    delta = target - now
    total = int(delta.total_seconds())
    days, rem = divmod(total, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, seconds = divmod(rem, 60)
    return {
        "days": days,
        "hours": hours,
        "minutes": minutes,
        "seconds": seconds,
        "targetYear": target_year,
        "location": location,
    }

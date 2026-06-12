"""Weather lookup (ported from Weathers.js) - OpenWeatherMap current weather.

Needs a free API key in ``skills.weather.api_key``. Without one it returns a
friendly message instead of erroring.
"""

from __future__ import annotations

import requests

from ..logutil import log
from ._textproc import process_text

_COMMAND_PATTERNS = [
    r"what\s*is\s*weather\s*in\s*",
    r"what\s*is\s*weather\s*at\s*",
    r"what\s*is\s*the\s*weather\s*at\s*",
    r"what\s*is\s*the\s*weather\s*like\s*in\s*",
    r"what\s*is\s*the\s*weather\s*like\s*",
    r"what\s*is\s*the\s*weather\s*in\s*",
]


def weather_lookup(text: str, api_key: str, units: str = "metric") -> str:
    city = process_text(text, _COMMAND_PATTERNS)
    if not api_key:
        return "I don't have a weather API key configured yet."
    if not city:
        return "Which city's weather would you like?"
    try:
        res = requests.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"q": city, "appid": api_key, "units": units, "lang": "en"},
            timeout=15,
        )
        data = res.json()
    except Exception as exc:
        log("[Weather] error:", exc)
        return "Sorry, I couldn't reach the weather service."

    if str(data.get("cod")) != "200" or not data.get("weather"):
        return f"I couldn't find the weather for {city}. Try saying it again."
    desc = data["weather"][0].get("description", "")
    main = data.get("main", {})
    wind = data.get("wind", {})
    unit_word = "Celsius" if units == "metric" else "Fahrenheit"
    return (
        f"Weather in {city}: {desc}, temperature is {round(main.get('temp', 0))} degrees {unit_word}, "
        f"humidity is {main.get('humidity', 0)} percent, with wind at {wind.get('speed', 0)}."
    )

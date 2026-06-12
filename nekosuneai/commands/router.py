"""Intent detection for spoken commands (ported from Node checkCondition)."""

from __future__ import annotations

import re
from enum import Enum


class Intent(str, Enum):
    TIME = "time"
    NEW_YEAR = "new_year"
    WEATHER = "weather"
    JOKE = "joke"
    MUSIC = "music"
    RESET = "reset"
    WIKI = "wiki"
    FANDOM = "fandom"
    SEARCH = "search"
    DEFAULT = "default"  # -> LLM


class CommandRouter:
    def detect(self, text: str) -> Intent:
        lower = (text or "").lower().strip()
        if not lower:
            return Intent.DEFAULT

        if any(p in lower for p in (
            "what is time in", "what is time at", "what is the time like",
            "what time is it in",
        )):
            return Intent.TIME
        if any(p in lower for p in ("new year", "new years", "new year's")):
            return Intent.NEW_YEAR
        if any(p in lower for p in (
            "what is weather in", "what is weather at", "what is the weather at",
            "what is the weather like",
        )):
            return Intent.WEATHER
        if "tell me a joke" in lower or "tell me a funny joke" in lower:
            return Intent.JOKE
        if (re.match(r"^play\s+", lower) or re.match(r"^queue\s+", lower)
                or re.match(r"^add\s+song\s+", lower)
                or re.search(r"\bplay (music|song|a song)\b", lower)
                or "play some music" in lower):
            return Intent.MUSIC
        if "reset memory" in lower or "reset" in lower:
            return Intent.RESET
        if lower.startswith("wiki") or "search wikipedia" in lower:
            return Intent.WIKI
        if (lower.startswith("fandom") or "search vrchat legends" in lower
                or "search vr chat legends" in lower):
            return Intent.FANDOM
        if re.search(r"\b(search|look up|lookup|find)\b", lower):
            return Intent.SEARCH
        return Intent.DEFAULT

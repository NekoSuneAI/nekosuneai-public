"""Jokes (ported from Jokes.js) - jokeapi.dev."""

from __future__ import annotations

import requests

from ..logutil import log


def get_joke(allow_explicit: bool = False) -> list[str]:
    url = "https://v2.jokeapi.dev/joke/Any"
    if not allow_explicit:
        url += "?blacklistFlags=nsfw,religious,political,racist,sexist,explicit"
    try:
        data = requests.get(url, timeout=15).json()
    except Exception as exc:
        log("[Jokes] fetch failed:", exc)
        return ["Sorry, I couldn't think of a joke right now."]

    if data.get("type") == "twopart":
        setup, delivery = data.get("setup", ""), data.get("delivery", "")
        return ["Okay, here's a joke for you.", setup, delivery, "Hope you liked that one!"]
    single = data.get("joke", "")
    return ["Okay, here's a joke for you.", single, "Hope you liked that one!"]

"""Bad-word moderation, ported from the Node BadWordDetected helper.

Multi-word terms match as substrings; single-word terms match whole tokens
only (so "ass" doesn't trip on "class"). The blocklist lives in
``config/badwords.json``.
"""

from __future__ import annotations

import json
import os
import re

PKG_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(PKG_DIR)
BADWORDS_PATH = os.path.join(ROOT_DIR, "config", "badwords.json")

_TOKEN_CLEAN = re.compile(r"[^a-z0-9'-]+")

FORBIDDEN_MESSAGE = (
    "This information is Forbidden access by my Creator. "
    "Please follow VRChat Terms of Service."
)


def _normalize_token(token: str) -> str:
    return _TOKEN_CLEAN.sub("", token.lower()).strip()


class Moderation:
    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self.badwords: list[str] = []
        if enabled:
            self._load()

    def _load(self) -> None:
        try:
            with open(BADWORDS_PATH, "r", encoding="utf-8") as fh:
                self.badwords = [str(w).strip() for w in json.load(fh) if str(w).strip()]
        except Exception:
            self.badwords = []

    def contains_banned_word(self, message: str) -> bool:
        if not self.enabled or not message:
            return False
        lower = message.lower()
        tokens = {_normalize_token(t) for t in lower.split()}
        tokens.discard("")
        for term in self.badwords:
            lower_term = term.lower()
            if " " in lower_term:
                if lower_term in lower:
                    return True
                continue
            if _normalize_token(term) in tokens:
                return True
        return False

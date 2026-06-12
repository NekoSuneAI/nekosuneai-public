"""Common base for TTS providers."""

from __future__ import annotations

import os
import time

PKG_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_DIR = os.path.dirname(PKG_DIR)
OUT_DIR = os.path.join(ROOT_DIR, "data", "audio")


class TTSProvider:
    """Interface: ``synthesize(text) -> path to a playable audio file``.

    The output extension is provider-specific (wav for piper/xtts, mp3 for
    gTTS); the AudioPlayer handles decoding either way.
    """

    extension = ".wav"

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.voice = cfg.get("voice", "en_US-lessac-medium")
        os.makedirs(OUT_DIR, exist_ok=True)

    def _out_path(self) -> str:
        stamp = int(time.time() * 1000)
        return os.path.join(OUT_DIR, f"tts_{stamp}{self.extension}")

    def synthesize(self, text: str) -> str:  # pragma: no cover - interface
        raise NotImplementedError

"""Google Translate TTS (gTTS) - online fallback voice.

Lightest possible option (no local model), but needs an internet connection
and produces mp3. Install with: ``pip install gTTS miniaudio``. miniaudio lets
the player decode the mp3 so it can be routed to your VRChat output device.
"""

from __future__ import annotations

from .base import TTSProvider


class GttsTTS(TTSProvider):
    extension = ".mp3"

    def __init__(self, cfg: dict):
        super().__init__(cfg)
        gcfg = cfg.get("gtts", {})
        self.lang = gcfg.get("lang", "en")
        self.tld = gcfg.get("tld", "com")

    def synthesize(self, text: str) -> str:
        try:
            from gtts import gTTS
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("gTTS not installed. Run: pip install gTTS miniaudio") from exc
        out_path = self._out_path()
        gTTS(text=text, lang=self.lang, tld=self.tld).save(out_path)
        return out_path

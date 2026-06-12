"""Text-to-speech providers (Piper, gTTS, XTTS).

RVC voice conversion is intentionally NOT included here - see TODO.md. The
providers are pluggable so an RVC post-processing step can wrap any of them
later.
"""

from .base import TTSProvider


def build_tts(cfg: dict) -> TTSProvider:
    provider = str(cfg.get("provider", "piper")).lower()
    if provider in ("piper", "piper_local"):
        from .piper import PiperTTS

        return PiperTTS(cfg)
    if provider in ("gtts", "google"):
        from .gtts_provider import GttsTTS

        return GttsTTS(cfg)
    if provider in ("xtts", "coqui"):
        from .xtts import XttsTTS

        return XttsTTS(cfg)
    raise ValueError(f"Unknown TTS provider: {provider!r}")

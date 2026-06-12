"""Speech-to-text providers (faster-whisper, vosk)."""

from .whisper_stt import WhisperSTT


def build_stt(cfg: dict):
    provider = str(cfg.get("provider", "faster-whisper")).lower()
    if provider in ("faster-whisper", "whisper", "faster_whisper"):
        return WhisperSTT(cfg)
    if provider == "vosk":
        from .vosk_stt import VoskSTT

        return VoskSTT(cfg)
    raise ValueError(f"Unknown STT provider: {provider!r}")

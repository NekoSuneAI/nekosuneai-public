"""Voice/voice-list catalogs for the setup GUI.

Each provider exposes a list of selectable "voices" for the GUI dropdown:
  - piper : voice model names from the rhasspy/piper-voices catalog (live, cached)
  - gtts  : language codes (gTTS speaks via Google Translate languages)
  - xtts  : the built-in Coqui XTTS v2 studio speakers

Returns ``[{"value": <stored value>, "label": <shown text>}, ...]`` and which
config path the GUI should bind the dropdown to for that provider.
"""

from __future__ import annotations

import requests

from ..logutil import log

PIPER_VOICES_JSON = "https://huggingface.co/rhasspy/piper-voices/raw/main/voices.json"

# Config path the "Voice" dropdown writes to, per provider.
VOICE_PATHS = {
    "piper": "tts.voice",
    "gtts": "tts.gtts.lang",
    "xtts": "tts.xtts.speaker",
}

_piper_cache: list[dict] | None = None

_PIPER_FALLBACK = [
    "en_US-lessac-medium", "en_US-amy-medium", "en_US-ryan-high",
    "en_US-libritts_r-medium", "en_GB-alan-medium", "en_GB-cori-high",
]

# gTTS supported languages (Google Translate TTS). Stable, no install needed.
_GTTS_LANGS = {
    "en": "English", "en-us": "English (US)", "en-uk": "English (UK)",
    "en-au": "English (Australia)", "es": "Spanish", "fr": "French",
    "de": "German", "it": "Italian", "pt": "Portuguese", "pt-br": "Portuguese (Brazil)",
    "nl": "Dutch", "pl": "Polish", "ru": "Russian", "ja": "Japanese",
    "ko": "Korean", "zh-CN": "Chinese (Mandarin)", "zh-TW": "Chinese (Taiwan)",
    "ar": "Arabic", "hi": "Hindi", "tr": "Turkish", "sv": "Swedish",
    "da": "Danish", "fi": "Finnish", "no": "Norwegian", "cs": "Czech",
    "el": "Greek", "hu": "Hungarian", "id": "Indonesian", "th": "Thai",
    "vi": "Vietnamese", "uk": "Ukrainian", "ro": "Romanian",
}

# Coqui XTTS v2 built-in studio speakers.
_XTTS_SPEAKERS = [
    "Claribel Dervla", "Daisy Studious", "Gracie Wise", "Tammie Ema",
    "Alison Dietlinde", "Ana Florence", "Annmarie Nele", "Asya Anara",
    "Brenda Stern", "Gitta Nikolina", "Henriette Usha", "Sofia Hellen",
    "Tammy Grit", "Tanja Adelina", "Vjollca Johnnie", "Andrew Chipper",
    "Badr Odhiambo", "Dionisio Schuyler", "Royston Min", "Viktor Eka",
    "Abrahan Mack", "Adde Michal", "Baldur Sanjin", "Craig Gutsy",
    "Damien Black", "Gilberto Mathias", "Ilkin Urbano", "Kazuhiko Atallah",
    "Ludvig Milivoj", "Suad Qasim", "Torcull Diarmuid", "Viktor Menelaos",
    "Zacharie Aimilios", "Nova Hogarth", "Maja Ruoho", "Uta Obando",
    "Lidiya Szekeres", "Chandra MacFarland", "Szofi Granger", "Camilla Holmström",
    "Lilya Stainthorpe", "Zofija Kendrick", "Narelle Moon", "Barbora MacLean",
    "Alexandra Hisakawa", "Alma María", "Rosemary Okafor", "Ige Behringer",
    "Filip Traverse", "Damjan Chapman", "Wulf Carlevaro", "Aaron Dreschner",
    "Kumar Dahl", "Eugenio Mataracı", "Ferran Simen", "Xavier Hayasaka",
    "Luis Moray", "Marcos Rudaski",
]


def _piper_voices() -> list[dict]:
    global _piper_cache
    if _piper_cache is not None:
        return _piper_cache
    try:
        data = requests.get(PIPER_VOICES_JSON, timeout=20).json()
        names = sorted(data.keys())
        _piper_cache = [{"value": n, "label": n} for n in names]
    except Exception as exc:
        log("[Voices] piper catalog fetch failed, using fallback:", exc)
        _piper_cache = [{"value": n, "label": n} for n in _PIPER_FALLBACK]
    return _piper_cache


# Curated Vosk models (from https://alphacephei.com/vosk/models). "small"
# models are the potato-friendly choice; the big ones are far more accurate.
_VOSK_MODELS = [
    ("vosk-model-small-en-us-0.15", "English US · small (40 MB) ⚡"),
    ("vosk-model-en-us-0.22-lgraph", "English US · lgraph (128 MB)"),
    ("vosk-model-en-us-0.22", "English US · large (1.8 GB)"),
    ("vosk-model-small-en-in-0.4", "English India · small (36 MB)"),
    ("vosk-model-small-es-0.42", "Spanish · small (39 MB)"),
    ("vosk-model-small-fr-0.22", "French · small (41 MB)"),
    ("vosk-model-small-de-0.15", "German · small (45 MB)"),
    ("vosk-model-small-it-0.22", "Italian · small (48 MB)"),
    ("vosk-model-small-pt-0.3", "Portuguese · small (31 MB)"),
    ("vosk-model-small-nl-0.22", "Dutch · small (39 MB)"),
    ("vosk-model-small-ru-0.22", "Russian · small (45 MB)"),
    ("vosk-model-small-cn-0.22", "Chinese · small (42 MB)"),
    ("vosk-model-small-ja-0.22", "Japanese · small (48 MB)"),
    ("vosk-model-small-ko-0.22", "Korean · small (82 MB)"),
    ("vosk-model-small-hi-0.22", "Hindi · small (42 MB)"),
    ("vosk-model-small-tr-0.3", "Turkish · small (35 MB)"),
]


def list_stt_models(provider: str) -> dict:
    """Models for the chosen STT provider (used by the GUI dropdown)."""
    provider = (provider or "faster-whisper").lower()
    if provider == "vosk":
        return {
            "provider": "vosk",
            "path": "stt.vosk.model",
            "models": [{"value": v, "label": lbl} for v, lbl in _VOSK_MODELS],
        }
    # faster-whisper
    whisper = ["tiny", "base", "small", "medium", "large-v3"]
    return {
        "provider": "faster-whisper",
        "path": "stt.model",
        "models": [{"value": m, "label": m} for m in whisper],
    }


def list_voices(provider: str) -> dict:
    provider = (provider or "piper").lower()
    if provider in ("piper", "piper_local"):
        return {"provider": "piper", "path": VOICE_PATHS["piper"], "voices": _piper_voices()}
    if provider in ("gtts", "google"):
        voices = [{"value": k, "label": f"{v} ({k})"} for k, v in _GTTS_LANGS.items()]
        return {"provider": "gtts", "path": VOICE_PATHS["gtts"], "voices": voices}
    if provider in ("xtts", "coqui"):
        voices = [{"value": s, "label": s} for s in _XTTS_SPEAKERS]
        return {"provider": "xtts", "path": VOICE_PATHS["xtts"], "voices": voices}
    return {"provider": provider, "path": "tts.voice", "voices": []}

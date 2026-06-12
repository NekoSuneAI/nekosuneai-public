"""Configuration loading with sane defaults.

Loads ``config/config.json`` if present, otherwise ``config/config.example.json``.
User config is deep-merged over the defaults so a partial config still works.
"""

from __future__ import annotations

import json
import os
from copy import deepcopy
from typing import Any, Dict

# Repo-relative paths. config.py lives in python/nekosuneai/, so the project
# root ("python/") is one directory up.
PKG_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(PKG_DIR)
CONFIG_DIR = os.path.join(ROOT_DIR, "config")

DEFAULTS: Dict[str, Any] = {
    "client_name": "NekoSuneAI",
    "auto_install_models": True,
    "vrchat": {
        "osc_target_address": "127.0.0.1",
        "osc_target_port": 9000,
        "osc_read_port": 9001,
    },
    "audio": {
        "input_device": None,
        "output_device": None,
        "sample_rate": 16000,
        "block_ms": 30,
        "silence_threshold": 0.012,
        "silence_hang_seconds": 1.0,
        "min_speech_seconds": 0.4,
        "max_utterance_seconds": 20.0,
        "wait_sounds_dir": "data/wait_music",
        "wait_sound_volume": 0.3,
    },
    "stt": {
        "provider": "faster-whisper",
        "model": "base",
        "device": "auto",
        "compute_type": "int8",
        "language": None,
        "beam_size": 1,
        "download_root": "",
        "hf_token": "",
        "vosk": {
            "model": "vosk-model-small-en-us-0.15",
            "models_dir": "models/vosk",
        },
    },
    "tts": {
        "provider": "piper",
        "voice": "en_US-lessac-medium",
        "gap_ms": 400,
        "piper": {"command": ["piper"], "models_dir": "models/piper", "use_cuda": False},
        "gtts": {"lang": "en", "tld": "com"},
        "xtts": {
            "model": "tts_models/multilingual/multi-dataset/xtts_v2",
            "speaker": "Ana Florence",
            "speaker_wav": "",
            "language": "en",
            "use_cuda": False,
        },
    },
    "llm": {
        "base_url": "http://127.0.0.1:11434/v1",
        "api_key": "ollama",
        "model": "qwen2.5:3b-instruct",
        "system_message": "You are NekoSuneAI, a friendly catgirl AI in VRChat. "
        "Keep replies short and conversational.",
        "memory_limit": 50,
        "memory_idle_clear_minutes": 10,
        "request_timeout": 120,
        "max_tokens": 220,
        "temperature": 0.8,
    },
    "moderation": {"enabled": True},
    "chatbox": {
        "max_chars": 114,
        "show_thinking": True,
        "thinking_play_wait_sounds": True,
        # Estimated "please wait up to ..." shown while thinking. The bar fills
        # toward this; it finishes early (100%) as soon as the reply is ready.
        "wait_seconds": 60,
    },
    "skills": {
        "weather": {"api_key": "", "units": "metric"},
        "search": {"base_url": "", "max_results": 5, "blocklist": [
            "news", "politics", "election", "government", "war", "religion",
        ]},
        "jokes": {"allow_explicit": False},
        "music": {"enabled": True},
    },
}


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge ``override`` into a copy of ``base``."""
    out = deepcopy(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


class Config:
    """Dot/most-importantly dict-accessible config wrapper."""

    def __init__(self, data: Dict[str, Any], path: str):
        self.data = data
        self.path = path

    def __getitem__(self, key: str) -> Any:
        return self.data[key]

    def get(self, key: str, default: Any = None) -> Any:
        return self.data.get(key, default)

    def section(self, key: str) -> Dict[str, Any]:
        return self.data.get(key, {})

    def resolve(self, relative: str) -> str:
        """Resolve a possibly-relative path against the project root."""
        if not relative:
            return relative
        if os.path.isabs(relative):
            return relative
        return os.path.normpath(os.path.join(ROOT_DIR, relative))


def load_config(path: str | None = None) -> Config:
    """Load and merge configuration."""
    candidates = []
    if path:
        candidates.append(path)
    candidates.append(os.path.join(CONFIG_DIR, "config.json"))
    candidates.append(os.path.join(CONFIG_DIR, "config.example.json"))

    chosen = next((c for c in candidates if c and os.path.isfile(c)), None)
    user_data: Dict[str, Any] = {}
    if chosen:
        with open(chosen, "r", encoding="utf-8") as fh:
            user_data = json.load(fh)
    else:
        chosen = "<defaults>"

    merged = _deep_merge(DEFAULTS, user_data)
    return Config(merged, chosen)

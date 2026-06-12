"""NekoSuneAI - lightweight Python VRChat voice AI.

Core loop:  mic -> STT (faster-whisper) -> command router / LLM ->
            TTS (piper / gtts / xtts) -> OSC chatbox + audio out.

Designed to run on a "potato laptop" fully locally.
"""

__version__ = "1.0.0"

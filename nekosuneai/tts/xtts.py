"""Coqui XTTS v2 - high quality / voice cloning (HEAVY, optional).

NOT recommended for a potato laptop: it pulls in PyTorch and is slow on CPU.
Install with ``pip install -r requirements-xtts.txt``. Provide a reference
clip in ``tts.xtts.speaker_wav`` to clone a voice; otherwise XTTS needs a
built-in speaker which this minimal wrapper does not select, so a speaker_wav
is effectively required.
"""

from __future__ import annotations

import os

from ..config import ROOT_DIR
from .base import TTSProvider


class XttsTTS(TTSProvider):
    extension = ".wav"

    def __init__(self, cfg: dict):
        super().__init__(cfg)
        xcfg = cfg.get("xtts", {})
        self.model_name = xcfg.get("model", "tts_models/multilingual/multi-dataset/xtts_v2")
        self.language = xcfg.get("language", "en")
        self.use_cuda = bool(xcfg.get("use_cuda", False))
        # A built-in studio speaker name (e.g. "Ana Florence"); used when no
        # speaker_wav reference clip is provided.
        self.speaker = xcfg.get("speaker", "Ana Florence")
        speaker_wav = xcfg.get("speaker_wav", "")
        if speaker_wav and not os.path.isabs(speaker_wav):
            speaker_wav = os.path.normpath(os.path.join(ROOT_DIR, speaker_wav))
        self.speaker_wav = speaker_wav
        self._tts = None

    def _ensure_engine(self):
        if self._tts is not None:
            return self._tts
        try:
            from TTS.api import TTS  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise RuntimeError(
                "Coqui TTS not installed. Run: pip install -r requirements-xtts.txt"
            ) from exc
        self._tts = TTS(self.model_name)
        if self.use_cuda:
            try:
                self._tts.to("cuda")
            except Exception:
                pass
        return self._tts

    def synthesize(self, text: str) -> str:
        engine = self._ensure_engine()
        out_path = self._out_path()
        kwargs = {"text": text, "file_path": out_path, "language": self.language}
        if self.speaker_wav:
            kwargs["speaker_wav"] = self.speaker_wav
        elif self.speaker:
            kwargs["speaker"] = self.speaker
        engine.tts_to_file(**kwargs)
        return out_path

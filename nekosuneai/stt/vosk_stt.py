"""Vosk speech-to-text (offline, very light - great for a potato).

Vosk runs a small Kaldi model entirely on CPU with a tiny memory footprint
(the ``small`` English model is ~40 MB). It expects 16-bit PCM mono audio, so
we convert the recorder's float32 array to int16 before feeding the recognizer.

Models live in ``stt.vosk.models_dir`` (default ``models/vosk``) and are
auto-downloaded from alphacephei.com on first use (see ``models.py``).
"""

from __future__ import annotations

import json
import os

import numpy as np

from ..config import ROOT_DIR
from ..logutil import log


class VoskSTT:
    def __init__(self, cfg: dict):
        vcfg = cfg.get("vosk", {})
        self.model_name = vcfg.get("model", "vosk-model-small-en-us-0.15")
        models_dir = vcfg.get("models_dir", "models/vosk")
        if not os.path.isabs(models_dir):
            models_dir = os.path.normpath(os.path.join(ROOT_DIR, models_dir))
        self.models_dir = models_dir
        # Recognizer rate must match the mic capture rate (16 kHz default).
        self.sample_rate = int(cfg.get("sample_rate", 16000))
        self._model = None
        self._logged = False

    def _ensure_model(self):
        if self._model is not None:
            return self._model
        try:
            from vosk import Model, SetLogLevel
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("Vosk is not installed. Run: pip install vosk") from exc
        SetLogLevel(-1)
        path = os.path.join(self.models_dir, self.model_name)
        if not os.path.isdir(path):
            raise FileNotFoundError(
                f"Vosk model not found: {path}\n"
                f"Download '{self.model_name}' from https://alphacephei.com/vosk/models "
                f"and unzip it into {self.models_dir} (or let auto-install fetch it)."
            )
        self._model = Model(path)
        if not self._logged:
            log(f"[Vosk] model loaded: {self.model_name}")
            self._logged = True
        return self._model

    def transcribe(self, audio: np.ndarray) -> str:
        if audio is None or len(audio) == 0:
            return ""
        from vosk import KaldiRecognizer

        model = self._ensure_model()
        rec = KaldiRecognizer(model, self.sample_rate)
        pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype(np.int16).tobytes()
        rec.AcceptWaveform(pcm)
        result = json.loads(rec.FinalResult())
        return (result.get("text") or "").strip()

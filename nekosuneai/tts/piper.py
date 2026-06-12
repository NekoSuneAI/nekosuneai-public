"""Piper TTS - the default, lightweight, fully-local voice.

Piper is a fast neural TTS that runs comfortably on CPU. Voices are ``.onnx``
model files (+ a ``.onnx.json`` config) downloaded from the Piper voices repo:
https://huggingface.co/rhasspy/piper-voices

Put ``<voice>.onnx`` and ``<voice>.onnx.json`` in ``tts.piper.models_dir`` (by
default ``python/models/piper``). We shell out to the ``piper`` CLI (from the
``piper-tts`` pip package or a standalone binary), feeding text on stdin.
"""

from __future__ import annotations

import os
import subprocess

from ..config import ROOT_DIR
from ..logutil import log
from .base import TTSProvider


class PiperTTS(TTSProvider):
    extension = ".wav"

    def __init__(self, cfg: dict):
        super().__init__(cfg)
        piper_cfg = cfg.get("piper", {})
        self.command = piper_cfg.get("command") or ["piper"]
        models_dir = piper_cfg.get("models_dir", "models/piper")
        if not os.path.isabs(models_dir):
            models_dir = os.path.normpath(os.path.join(ROOT_DIR, models_dir))
        self.models_dir = models_dir
        self.use_cuda = bool(piper_cfg.get("use_cuda", False))

    def _model_path(self) -> str:
        path = os.path.join(self.models_dir, f"{self.voice}.onnx")
        if not os.path.isfile(path):
            raise FileNotFoundError(
                f"Piper voice not found: {path}\n"
                f"Download '{self.voice}.onnx' (+ .onnx.json) from "
                "https://huggingface.co/rhasspy/piper-voices into "
                f"{self.models_dir}"
            )
        return path

    def synthesize(self, text: str) -> str:
        out_path = self._out_path()
        model_path = self._model_path()
        args = list(self.command) + ["-m", model_path, "-f", out_path]
        if self.use_cuda:
            args.append("--cuda")
        try:
            proc = subprocess.run(
                args,
                input=(text + "\n").encode("utf-8"),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                check=False,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                f"Could not launch piper ({self.command!r}). Install it with "
                "`pip install piper-tts` or point tts.piper.command at the binary."
            ) from exc
        if proc.returncode != 0 or not os.path.isfile(out_path):
            err = proc.stderr.decode("utf-8", "ignore") if proc.stderr else ""
            raise RuntimeError(f"Piper failed (code {proc.returncode}): {err.strip()}")
        return out_path

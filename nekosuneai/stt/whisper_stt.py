"""faster-whisper speech-to-text.

faster-whisper accepts a float32 numpy array directly, so we never have to
write the mic audio to a temp wav first.

Compute type is chosen defensively: not every CPU/backend supports efficient
``int8`` (you'd get "the target device or backend do not support efficient int8
computation"). We ask ctranslate2 which compute types the device actually
supports and fall back through int8 -> float32 -> default, retrying the model
build if it still fails. ``tiny`` / ``base`` are the recommended potato models.
"""

from __future__ import annotations

import os

import numpy as np

from ..logutil import log, quiet_hf_warnings

# Preference order when the requested compute type isn't available.
_COMPUTE_FALLBACK = ["int8", "int8_float32", "int8_float16", "float16", "float32", "default"]


def _register_cuda_dll_dirs() -> None:
    """Make pip-installed NVIDIA CUDA libraries loadable on Windows.

    faster-whisper / ctranslate2 need cublas64_12.dll and cuDNN at runtime.
    The ``nvidia-*-cu12`` pip packages ship these under
    ``site-packages/nvidia/<lib>/bin``, but Windows won't find them unless we
    add those folders to the DLL search path. Safe no-op elsewhere or when the
    packages aren't installed.
    """
    if os.name != "nt":
        return
    try:
        import nvidia  # provided by the nvidia-*-cu12 packages
    except Exception:
        return
    found = []
    for base in getattr(nvidia, "__path__", []):
        for sub in ("cuda_runtime", "cublas", "cudnn", "cuda_nvrtc", "cufft"):
            d = os.path.join(base, sub, "bin")
            if os.path.isdir(d):
                found.append(d)
                try:
                    os.add_dll_directory(d)
                except Exception:
                    pass
    # ctranslate2 loads cublas/cudnn via the OS loader, which also searches
    # PATH for an explicitly-loaded DLL's *dependencies* (e.g. cublas needs
    # cudart). Prepend our dirs so those dependencies resolve too.
    if found:
        os.environ["PATH"] = os.pathsep.join(found) + os.pathsep + os.environ.get("PATH", "")


# Register before ctranslate2 / faster-whisper is ever imported below.
_register_cuda_dll_dirs()


def _cuda_available() -> bool:
    """True only if a usable CUDA device is present.

    Avoids attempting a CUDA model build (which would try to load
    cublas64_*.dll / cuDNN and crash) on machines without the CUDA runtime.
    """
    try:
        import ctranslate2

        return ctranslate2.get_cuda_device_count() > 0
    except Exception:
        return False


def _supported_computes(device: str) -> set:
    try:
        import ctranslate2

        return set(ctranslate2.get_supported_compute_types(device))
    except Exception:
        return set()


def _resolve_compute(device: str, requested: str) -> str:
    supported = _supported_computes(device)
    if not supported:
        return requested  # let WhisperModel decide / fall back at build time
    requested = (requested or "auto").lower()
    if requested not in ("auto", "default") and requested in supported:
        return requested
    for candidate in _COMPUTE_FALLBACK:
        if candidate in supported:
            return candidate
    return "default"


class WhisperSTT:
    def __init__(self, cfg: dict):
        self.model_name = cfg.get("model", "base")
        self.device = (cfg.get("device") or "auto").lower()
        self.compute_type = cfg.get("compute_type", "int8")
        self.language = cfg.get("language") or None
        self.beam_size = int(cfg.get("beam_size", 1))
        from ..models import WHISPER_DIR

        self.download_root = cfg.get("download_root") or WHISPER_DIR
        token = cfg.get("hf_token")
        if token:
            os.environ.setdefault("HF_TOKEN", token)
        self._model = None
        self._device_used = None
        self._force_cpu = False

    def _build(self, device: str, compute: str):
        from faster_whisper import WhisperModel

        return WhisperModel(
            self.model_name, device=device, compute_type=compute, download_root=self.download_root
        )

    def _ensure_model(self):
        if self._model is not None:
            return self._model
        quiet_hf_warnings()

        # Device candidates. CPU is always the last-resort fallback so a missing
        # CUDA runtime (e.g. cublas64_12.dll) degrades gracefully instead of
        # crashing transcription.
        if self._force_cpu or self.device == "cpu":
            devices = ["cpu"]
        elif self.device == "auto":
            devices = (["cuda"] if _cuda_available() else []) + ["cpu"]
        else:
            devices = [self.device, "cpu"]  # explicit GPU, but fall back to CPU
        # De-duplicate while preserving order.
        seen = set()
        devices = [d for d in devices if not (d in seen or seen.add(d))]

        last_err = None
        for device in devices:
            compute = _resolve_compute(device, self.compute_type)
            # Try the resolved compute, then progressively safer fallbacks.
            tried = []
            for candidate in [compute] + [c for c in ("float32", "default") if c != compute]:
                if candidate in tried:
                    continue
                tried.append(candidate)
                try:
                    self._model = self._build(device, candidate)
                    self._device_used = device
                    log(f"[Whisper] model={self.model_name} device={device} compute={candidate}")
                    return self._model
                except Exception as exc:
                    last_err = exc
                    log(f"[Whisper] {candidate} on {device} unavailable: {exc}")
        raise RuntimeError(f"Could not initialize faster-whisper: {last_err}")

    @staticmethod
    def _is_cuda_error(exc: Exception) -> bool:
        text = str(exc).lower()
        return any(k in text for k in ("cublas", "cudnn", "cuda", "gpu", "cudart"))

    def transcribe(self, audio: np.ndarray) -> str:
        """Transcribe a float32 mono 16 kHz numpy array to text."""
        if audio is None or len(audio) == 0:
            return ""
        try:
            model = self._ensure_model()
            segments, _info = model.transcribe(
                audio, language=self.language, beam_size=self.beam_size, vad_filter=True
            )
            return " ".join(seg.text for seg in segments).strip()
        except Exception as exc:
            # CUDA runtime can fail lazily at the first transcribe (e.g. cublas
            # DLL missing) even though the model built fine. Rebuild on CPU once.
            if self._is_cuda_error(exc) and self._device_used != "cpu" and not self._force_cpu:
                log(f"[Whisper] CUDA failed at runtime ({exc}); rebuilding on CPU.")
                self._force_cpu = True
                self._model = None
                model = self._ensure_model()
                segments, _info = model.transcribe(
                    audio, language=self.language, beam_size=self.beam_size, vad_filter=True
                )
                return " ".join(seg.text for seg in segments).strip()
            raise

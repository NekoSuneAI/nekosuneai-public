"""Automatic model installation for Piper voices and faster-whisper.

- **Piper**: downloads ``<voice>.onnx`` + ``<voice>.onnx.json`` from the
  rhasspy/piper-voices HuggingFace repo, into ``tts.piper.models_dir``.
- **faster-whisper**: the ``WhisperModel`` constructor auto-downloads weights
  on first use; we just point its ``download_root`` at ``models/whisper`` and
  expose an explicit pre-download for the GUI.

Both are safe to call repeatedly - they skip work if files already exist.
"""

from __future__ import annotations

import os
from typing import Callable

import requests

from .config import ROOT_DIR
from .logutil import log

PIPER_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
WHISPER_DIR = os.path.join(ROOT_DIR, "models", "whisper")
VOSK_BASE = "https://alphacephei.com/vosk/models"
VOSK_DIR = os.path.join(ROOT_DIR, "models", "vosk")


def _piper_voice_url_path(voice: str) -> str:
    """Map e.g. ``en_US-lessac-medium`` -> ``en/en_US/lessac/medium``."""
    parts = voice.split("-")
    if len(parts) < 3:
        raise ValueError(
            f"Unrecognized Piper voice name: {voice!r} "
            "(expected like 'en_US-lessac-medium')."
        )
    locale = parts[0]
    quality = parts[-1]
    name = "-".join(parts[1:-1])
    lang = locale.split("_")[0]
    return f"{lang}/{locale}/{name}/{quality}"


def _download(url: str, dest: str, progress: Callable[[str], None] | None = None) -> None:
    tmp = dest + ".part"
    with requests.get(url, stream=True, timeout=120) as res:
        res.raise_for_status()
        total = int(res.headers.get("Content-Length", 0))
        done = 0
        with open(tmp, "wb") as fh:
            for chunk in res.iter_content(chunk_size=1 << 16):
                if not chunk:
                    continue
                fh.write(chunk)
                done += len(chunk)
                if progress and total:
                    progress(f"{os.path.basename(dest)}: {done * 100 // total}%")
    os.replace(tmp, dest)


def ensure_piper_voice(
    voice: str, models_dir: str, progress: Callable[[str], None] | None = None
) -> str:
    """Download a Piper voice if missing. Returns the .onnx path."""
    os.makedirs(models_dir, exist_ok=True)
    onnx_path = os.path.join(models_dir, f"{voice}.onnx")
    json_path = onnx_path + ".json"
    if os.path.isfile(onnx_path) and os.path.isfile(json_path):
        return onnx_path

    sub = _piper_voice_url_path(voice)
    onnx_url = f"{PIPER_BASE}/{sub}/{voice}.onnx"
    json_url = f"{PIPER_BASE}/{sub}/{voice}.onnx.json"

    if not os.path.isfile(json_path):
        log(f"[Models] Downloading Piper config {voice}.onnx.json ...")
        _download(json_url, json_path, progress)
    if not os.path.isfile(onnx_path):
        log(f"[Models] Downloading Piper voice {voice}.onnx (this can take a bit) ...")
        _download(onnx_url, onnx_path, progress)
    log(f"[Models] Piper voice ready: {onnx_path}")
    return onnx_path


def ensure_vosk_model(
    model_name: str, models_dir: str, progress: Callable[[str], None] | None = None
) -> str:
    """Download + unzip a Vosk model if missing. Returns the model directory."""
    os.makedirs(models_dir, exist_ok=True)
    dest = os.path.join(models_dir, model_name)
    if os.path.isdir(dest):
        return dest

    import zipfile

    url = f"{VOSK_BASE}/{model_name}.zip"
    zip_path = dest + ".zip"
    log(f"[Models] Downloading Vosk model {model_name} (this can take a bit) ...")
    _download(url, zip_path, progress)
    if progress:
        progress(f"unzipping {model_name} ...")
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(models_dir)
    try:
        os.remove(zip_path)
    except OSError:
        pass
    if not os.path.isdir(dest):
        # Some archives nest under a slightly different folder name; find it.
        raise RuntimeError(
            f"Vosk archive extracted but '{dest}' was not found. "
            f"Check {models_dir} for the unzipped folder name."
        )
    log(f"[Models] Vosk model ready: {dest}")
    return dest


def ensure_whisper_model(
    model_name: str, progress: Callable[[str], None] | None = None
) -> str:
    """Pre-download a faster-whisper model into ``models/whisper``.

    Returns the download root. faster-whisper also downloads lazily on first
    transcription, so calling this is optional (the GUI uses it).
    """
    os.makedirs(WHISPER_DIR, exist_ok=True)
    from .logutil import quiet_hf_warnings

    quiet_hf_warnings()
    try:
        from faster_whisper import WhisperModel
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("faster-whisper is not installed.") from exc
    if progress:
        progress(f"Fetching whisper '{model_name}' ...")
    log(f"[Models] Ensuring faster-whisper model '{model_name}' ...")
    # Instantiating triggers the download; we drop the instance right after.
    # Use 'default' compute so this works on any CPU (some don't support int8).
    WhisperModel(model_name, device="cpu", compute_type="default", download_root=WHISPER_DIR)
    log("[Models] Whisper model ready.")
    return WHISPER_DIR

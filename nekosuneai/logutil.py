"""Tiny timestamped logger + rolling log file (mirrors the Node LogFiles helper)."""

from __future__ import annotations

import datetime
import os
import threading

PKG_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(PKG_DIR)
LOG_DIR = os.path.join(ROOT_DIR, "logs")
LOG_FILE = os.path.join(LOG_DIR, "nekosuneai.log")

_lock = threading.Lock()


def _stamp() -> str:
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _safe_print(line: str) -> None:
    """Print without crashing on consoles that can't encode the chars (cp1252)."""
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        import sys

        enc = (getattr(sys.stdout, "encoding", None) or "ascii")
        print(line.encode(enc, errors="replace").decode(enc, errors="replace"), flush=True)


def log(*parts: object) -> None:
    """Print a timestamped line to stdout and append it to the log file."""
    message = " ".join(str(p) for p in parts)
    line = f"[{_stamp()}] {message}"
    _safe_print(line)
    write_to_log_file(message)


def quiet_hf_warnings() -> None:
    """Silence the noisy 'unauthenticated requests to the HF Hub' warning.

    It's harmless (just a rate-limit notice during model downloads). Set a
    HF_TOKEN env var if you want higher rate limits instead.
    """
    import logging

    for name in ("huggingface_hub", "huggingface_hub.utils._http"):
        logging.getLogger(name).setLevel(logging.ERROR)


def write_to_log_file(message: str) -> None:
    try:
        with _lock:
            os.makedirs(LOG_DIR, exist_ok=True)
            with open(LOG_FILE, "a", encoding="utf-8") as fh:
                fh.write(f"[{_stamp()}] {message}\n")
    except Exception:
        # Logging must never crash the app.
        pass

"""Flask server powering the NekoSuneAI setup GUI.

A small local control panel:
  - edit & save config.json (friendly form + raw JSON)
  - list audio input/output devices
  - download Piper / faster-whisper models
  - start / stop the bot as a subprocess

Run with: ``python -m nekosuneai.gui``  (then open http://127.0.0.1:8730)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading

from ..config import CONFIG_DIR, DEFAULTS, ROOT_DIR, load_config
from ..logutil import log

CONFIG_PATH = os.path.join(CONFIG_DIR, "config.json")

try:
    from flask import Flask, jsonify, request, send_from_directory
except Exception as exc:  # pragma: no cover
    raise SystemExit(
        "The GUI needs Flask. Install it with: pip install flask"
    ) from exc

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")

app = Flask(__name__, static_folder=None)

# --- bot subprocess management ------------------------------------------------
_bot_proc: subprocess.Popen | None = None
_bot_lock = threading.Lock()


def _bot_running() -> bool:
    return _bot_proc is not None and _bot_proc.poll() is None


# --- routes -------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(TEMPLATE_DIR, "index.html")


@app.route("/api/config", methods=["GET"])
def get_config():
    cfg = load_config()
    return jsonify({"config": cfg.data, "defaults": DEFAULTS, "path": cfg.path})


@app.route("/api/config", methods=["POST"])
def save_config():
    data = request.get_json(force=True, silent=True) or {}
    cfg = data.get("config", data)
    if not isinstance(cfg, dict):
        return jsonify({"ok": False, "error": "Config must be a JSON object."}), 400
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(CONFIG_PATH, "w", encoding="utf-8") as fh:
            json.dump(cfg, fh, indent=2)
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500
    return jsonify({"ok": True, "path": CONFIG_PATH})


@app.route("/api/devices", methods=["GET"])
def devices():
    try:
        import sounddevice as sd

        hostapis = sd.query_hostapis()
        out = []
        for idx, dev in enumerate(sd.query_devices()):
            ha = dev.get("hostapi")
            ha_name = hostapis[ha]["name"] if isinstance(ha, int) and ha < len(hostapis) else ""
            out.append({
                "index": idx,
                "name": dev.get("name", f"Device {idx}"),
                "hostapi": ha_name,
                "max_input": dev.get("max_input_channels", 0),
                "max_output": dev.get("max_output_channels", 0),
            })
        return jsonify({"ok": True, "devices": out})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc), "devices": []})


@app.route("/api/voices", methods=["GET"])
def voices():
    from .voices import list_voices

    provider = request.args.get("provider", "piper")
    try:
        return jsonify({"ok": True, **list_voices(provider)})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc), "voices": []})


@app.route("/api/stt/models", methods=["GET"])
def stt_models():
    from .voices import list_stt_models

    provider = request.args.get("provider", "faster-whisper")
    try:
        return jsonify({"ok": True, **list_stt_models(provider)})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc), "models": []})


@app.route("/api/models/vosk", methods=["POST"])
def download_vosk():
    data = request.get_json(force=True, silent=True) or {}
    model = data.get("model", "vosk-model-small-en-us-0.15")
    models_dir = data.get("models_dir", os.path.join(ROOT_DIR, "models", "vosk"))
    if not os.path.isabs(models_dir):
        models_dir = os.path.join(ROOT_DIR, models_dir)
    try:
        from ..models import ensure_vosk_model

        path = ensure_vosk_model(model, models_dir)
        return jsonify({"ok": True, "path": path})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route("/api/models/piper", methods=["POST"])
def download_piper():
    data = request.get_json(force=True, silent=True) or {}
    voice = data.get("voice", "en_US-lessac-medium")
    models_dir = data.get("models_dir", os.path.join(ROOT_DIR, "models", "piper"))
    if not os.path.isabs(models_dir):
        models_dir = os.path.join(ROOT_DIR, models_dir)
    try:
        from ..models import ensure_piper_voice

        path = ensure_piper_voice(voice, models_dir)
        return jsonify({"ok": True, "path": path})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route("/api/models/whisper", methods=["POST"])
def download_whisper():
    data = request.get_json(force=True, silent=True) or {}
    model = data.get("model", "base")
    try:
        from ..models import ensure_whisper_model

        root = ensure_whisper_model(model)
        return jsonify({"ok": True, "path": root})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route("/api/bot/status", methods=["GET"])
def bot_status():
    return jsonify({"running": _bot_running()})


@app.route("/api/bot/start", methods=["POST"])
def bot_start():
    global _bot_proc
    with _bot_lock:
        if _bot_running():
            return jsonify({"ok": True, "running": True, "message": "Already running."})
        try:
            _bot_proc = subprocess.Popen([sys.executable, "-m", "nekosuneai"], cwd=ROOT_DIR)
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500
    log("[GUI] bot started.")
    return jsonify({"ok": True, "running": True})


@app.route("/api/bot/stop", methods=["POST"])
def bot_stop():
    global _bot_proc
    with _bot_lock:
        if not _bot_running():
            return jsonify({"ok": True, "running": False, "message": "Not running."})
        try:
            _bot_proc.terminate()
            try:
                _bot_proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                _bot_proc.kill()
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500
        _bot_proc = None
    log("[GUI] bot stopped.")
    return jsonify({"ok": True, "running": False})


def main(host: str = "127.0.0.1", port: int = 8730) -> None:
    log(f"[GUI] NekoSuneAI setup is live at http://{host}:{port}")
    app.run(host=host, port=port, debug=False)


if __name__ == "__main__":
    main()

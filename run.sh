#!/usr/bin/env bash
# NekoSuneAI (Python) launcher for Linux/macOS.
set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  echo "[setup] Creating virtual environment..."
  python3 -m venv .venv
  # shellcheck disable=SC1091
  source .venv/bin/activate
  echo "[setup] Installing requirements..."
  python -m pip install --upgrade pip
  python -m pip install -r requirements.txt
else
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

if [ ! -f "config/config.json" ]; then
  echo "[setup] No config/config.json found - copying example."
  cp config/config.example.json config/config.json
fi

python -m nekosuneai "$@"

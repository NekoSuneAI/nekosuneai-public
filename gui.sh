#!/usr/bin/env bash
# Launch the NekoSuneAI setup GUI (web UI) on Linux/macOS.
set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  # shellcheck disable=SC1091
  source .venv/bin/activate
  python -m pip install --upgrade pip
  python -m pip install -r requirements.txt
else
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

echo "Opening setup at http://127.0.0.1:8730"
python -m nekosuneai.gui "$@"

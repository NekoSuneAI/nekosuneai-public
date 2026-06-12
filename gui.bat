@echo off
REM Launch the NekoSuneAI setup GUI (web UI) on Windows.
setlocal
cd /d "%~dp0"

if not exist ".venv\" (
  echo [setup] Creating virtual environment...
  python -m venv .venv
  call .venv\Scripts\activate.bat
  python -m pip install --upgrade pip
  python -m pip install -r requirements.txt
) else (
  call .venv\Scripts\activate.bat
)

echo Opening setup at http://127.0.0.1:8730
start "" "http://127.0.0.1:8730"
python -m nekosuneai.gui %*
endlocal

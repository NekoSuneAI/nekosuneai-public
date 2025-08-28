@echo off
setlocal enableextensions enabledelayedexpansion

echo ================================
echo Starting Setup Script
echo ================================

:: --- Step 1: Update Git repo ---
echo Pulling latest code from Git...
git pull

:: --- Step 2: Check for SoX ---
echo Checking for SoX in tools\sox...

rem === Root = folder of this .bat (handles D:\DEV\NekoSuneAI or wherever) ===
set "ROOT=%~dp0"

rem === Where we keep SoX ===
set "SOX_BASE=%ROOT%tools\sox"

if not exist "%SOX_BASE%\sox-14.4.1\sox.exe" (
    echo SoX not found. Downloading SoX 14.4.1...
    if not exist "%SOX_BASE%" mkdir "%SOX_BASE%"
    powershell -NoLogo -NoProfile -Command ^
      "Invoke-WebRequest 'https://master.dl.sourceforge.net/project/sox/sox/14.4.1/sox-14.4.1-win32.zip?viasf=1' -OutFile '%SOX_BASE%\sox.zip'"
    powershell -NoLogo -NoProfile -Command ^
      "Expand-Archive -LiteralPath '%SOX_BASE%\sox.zip' -DestinationPath '%SOX_BASE%' -Force"
    del /q "%SOX_BASE%\sox.zip"
) else (
    echo SoX found in "%SOX_BASE%\sox-14-4-1"
)


:: Add SoX to PATH for current session
set "PATH=%CD%\tools\sox\sox-14-4-1;%PATH%"

:: --- Step 3: Install node modules ---
if not exist node_modules (
    echo Downloading node modules...
    npm install
    echo Building speaker...
    npm rebuild speaker
    echo Installing node modules...
    npm install
)

:: --- Step 4: Run the app ---
echo Launching the app...
node index.js

endlocal
pause

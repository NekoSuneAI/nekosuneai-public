@echo off
setlocal enableextensions enabledelayedexpansion

echo ================================
echo Starting Setup Script
echo ================================

:: --- Step 1: Update Git repo ---
echo Pulling latest code from Git...
git pull

:: --- Step 2: Check for SoX ---
echo 🔍 Checking for SoX in tools\sox...

if not exist ".\tools\sox\sox-14-4-1\sox.exe" (
    echo SoX not found. Downloading SoX 14.4.1...
    powershell -Command "Invoke-WebRequest https://master.dl.sourceforge.net/project/sox/sox/14.4.1/sox-14.4.1-win32.zip?viasf=1 -OutFile sox.zip"
    powershell -Command "Expand-Archive sox.zip -DestinationPath .\tools\sox"
    del sox.zip
) else (
    echo SoX found in tools\sox
)

:: Add SoX to PATH for current session
set PATH=%CD%\tools\sox\sox-14-4-1;%PATH%

:: --- Step 3: Install node modules ---
if not exist node_modules (
    echo Installing node modules...
    npm install
)

:: --- Step 4: Run the app ---
echo Launching the app...
node index.js

endlocal
pause

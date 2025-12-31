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

set "SOX_DIR="
if exist ".\tools\sox\sox-14.4.1\sox.exe" set "SOX_DIR=.\tools\sox\sox-14.4.1"
if exist ".\tools\sox\sox-14-4-1\sox.exe" set "SOX_DIR=.\tools\sox\sox-14-4-1"

if "%SOX_DIR%"=="" (
    echo SoX not found. Downloading SoX 14.4.1...
    powershell -Command "Invoke-WebRequest https://master.dl.sourceforge.net/project/sox/sox/14.4.1/sox-14.4.1-win32.zip?viasf=1 -OutFile sox.zip"
    powershell -Command "Expand-Archive sox.zip -DestinationPath .\tools\sox"
    del sox.zip
    if exist ".\tools\sox\sox-14.4.1\sox.exe" set "SOX_DIR=.\tools\sox\sox-14.4.1"
    if "%SOX_DIR%"=="" if exist ".\tools\sox\sox-14-4-1\sox.exe" set "SOX_DIR=.\tools\sox\sox-14-4-1"
) else (
    echo SoX found in tools\sox
)

if "%SOX_DIR%"=="" (
    echo ERROR: SoX was not found after install.
    exit /b 1
)

:: Add SoX to PATH for current session
set "PATH=%CD%\%SOX_DIR%;%PATH%"

:: --- Step 3: Install node modules ---
if not exist node_modules (
    echo Installing node modules...
    npm rebuild speaker
    npm install
)

:: --- Step 4: Run the app ---
echo Launching the app...
node index.js

endlocal
pause

@echo off
setlocal

echo 📦 Starting Windows setup script...

:: --- Step 1: Git Pull ---
echo 🔄 Pulling latest code from Git...
git pull

:: --- Step 2: Check Node.js ---
echo 🔍 Checking for Node.js...
for /f "tokens=2 delims=v." %%v in ('node -v 2^>nul') do set NODE_MAJOR=%%v

if not defined NODE_MAJOR (
    echo ⚠️ Node.js not found. Installing Node.js v20...
    powershell -Command "Invoke-WebRequest https://nodejs.org/dist/v20.14.0/node-v20.14.0-x64.msi -OutFile node.msi"
    msiexec /i node.msi /qn
    del node.msi
    set PATH=%ProgramFiles%\nodejs;%PATH%
) else if %NODE_MAJOR% LSS 20 (
    echo ❌ Node.js version is lower than 20. Please upgrade manually.
    pause
    exit /b
)

:: --- Step 3: Check Sox ---
echo 🔍 Checking for SoX (sox-14-4-1)...

if not exist ".\tools\sox\sox-14-4-1\sox.exe" (
    echo ⚠️ SoX not found. Downloading SoX 14.4.1...
    powershell -Command "Invoke-WebRequest https://master.dl.sourceforge.net/project/sox/sox/14.4.1/sox-14.4.1-win32.zip?viasf=1 -OutFile sox.zip"
    powershell -Command "Expand-Archive sox.zip -DestinationPath .\tools\sox"
    del sox.zip
) else (
    echo ✅ SoX is already available in tools.
)

:: Add SoX to current PATH for this session
set PATH=%CD%\tools\sox\sox-14-4-1;%PATH%


:: --- Step 4: Install Node Modules ---
if not exist node_modules (
    echo 📦 Installing node modules...
    npm install
)

:: --- Step 5: Run the App ---
echo 🚀 Starting your app...
node index.js

endlocal
pause

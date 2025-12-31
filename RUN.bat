@echo off
setlocal ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION
title Project Setup Assistant - Creator: NekoSuneVR
color 0B

echo.
echo ==================================================
echo  Project Setup Assistant  -  Creator: NekoSuneVR
echo ==================================================
echo.

REM --- Vars ---
set "ROOT=%~dp0"
set "SOX_BASE=%ROOT%tools\sox"
set "SOX_EXE="
set "SOX_ZIP=%TEMP%\sox-win.zip"
set "APP_EXIT=0"

REM --- Step 0: Preflight ---
echo [1/5] Checking tools...
where git >nul 2>&1 && (echo   OK: git) || (echo   WARN: git not found)
where node >nul 2>&1 && (echo   OK: node) || (echo   ERROR: node not found)
where npm  >nul 2>&1 && (echo   OK: npm)  || (echo   WARN: npm not found)
echo.

REM --- Step 1: Update repo (best-effort) ---
echo [2/5] Updating repository (git pull)...
where git >nul 2>&1 && (git pull) || (echo   Skipping: git not installed)
echo.

REM --- Step 2: Find/Install SoX ---
echo [3/5] Checking for SoX under "%SOX_BASE%"...

set "SOX_DIR="
if exist "%SOX_BASE%\sox-14.4.1\sox.exe" set "SOX_DIR=%SOX_BASE%\sox-14.4.1"
if exist "%SOX_BASE%\sox-14-4-1\sox.exe" set "SOX_DIR=%SOX_BASE%\sox-14-4-1"

if "%SOX_DIR%"=="" (
  echo   SoX not found. Downloading SoX 14.4.1...
  if not exist "%SOX_BASE%" mkdir "%SOX_BASE%"
  powershell -NoLogo -NoProfile -Command ^
    "Invoke-WebRequest 'https://master.dl.sourceforge.net/project/sox/sox/14.4.1/sox-14.4.1-win32.zip?viasf=1' -OutFile '%SOX_BASE%\sox.zip'"
  powershell -NoLogo -NoProfile -Command ^
    "Expand-Archive -LiteralPath '%SOX_BASE%\sox.zip' -DestinationPath '%SOX_BASE%' -Force"
  del /q "%SOX_BASE%\sox.zip"
  if exist "%SOX_BASE%\sox-14.4.1\sox.exe" set "SOX_DIR=%SOX_BASE%\sox-14.4.1"
  if "%SOX_DIR%"=="" if exist "%SOX_BASE%\sox-14-4-1\sox.exe" set "SOX_DIR=%SOX_BASE%\sox-14-4-1"
) else (
  echo   SoX found in "%SOX_DIR%"
)

if "%SOX_DIR%"=="" (
  echo   ERROR: SoX was not found after install.
  set "APP_EXIT=1"
  goto :end
)

REM Add SoX to PATH for current session
set "PATH=%SOX_DIR%;%PATH%"
echo.

REM --- Step 3: Dependencies ---
echo [4/5] Installing dependencies...

if exist "%ROOT%node_modules" (
  echo   node_modules present. (Run "npm ci" for a clean install if needed.)
) else (
  where npm >nul 2>&1
  if errorlevel 1 (
    echo   WARNING: npm not available. Skipping install.
  ) else (
    echo   Running: npm install
    call npm rebuild speaker
    call npm install
    if errorlevel 1 (
      echo   ERROR: npm install failed.
      set "APP_EXIT=1"
      REM Keep going so we still attempt to launch if possible.
    )
  )
)
echo.

REM --- Step 4: Launch ---
echo [5/5] Launching app...

where node >nul 2>&1
if errorlevel 1 (
  echo   ERROR: node is not available. Aborting launch.
  set "APP_EXIT=1"
  goto :end
)

set "HAS_START=0"
if exist "%ROOT%package.json" (
  for /f "usebackq delims=" %%S in (`
    powershell -NoLogo -NoProfile -Command ^
      "$p=Get-Content -Raw -LiteralPath '%ROOT%package.json' ^| ConvertFrom-Json; if($p.scripts.start){'YES'}"
  `) do (
    if /i "%%S"=="YES" set "HAS_START=1"
  )
)

if "%HAS_START%"=="1" (
  echo   Starting: npm run start
  pushd "%ROOT%"
  call npm run start
  popd
  set "APP_EXIT=%ERRORLEVEL%"
) else (
  if exist "%ROOT%index.js" (
    echo   Starting: node index.js
    pushd "%ROOT%"
    node "%ROOT%index.js"
    popd
    set "APP_EXIT=%ERRORLEVEL%"
  ) else (
    echo   ERROR: No "start" script and no index.js found.
    set "APP_EXIT=1"
  )
)

:end
echo(
echo Done. App exit code: %APP_EXIT%
echo Creator: NekoSuneVR
echo(
pause
endlocal

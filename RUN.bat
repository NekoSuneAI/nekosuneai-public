@echo off
title VRCHAT AI BOT - MADE BY NEKOSUNEVR
color 2

if not exist "node_modules" (
    cls
    echo Node modules folder not found. Running npm install...
    npm install
    echo INSTALLED NPM PACKAGES!!
    echo STARTING!!
    node index.js
    echo STOPPING!!
) else (
    cls
    echo Node modules folder found. Skipping npm install.
    echo STARTING!!
    node index.js
    echo STOPPING!!
)
PAUSE

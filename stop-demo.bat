@echo off
title CounterFlow POS - Stop
cd /d "%~dp0"

echo Stopping CounterFlow backend + database containers...
docker compose down
echo.
echo Stopped. Data is preserved in the Docker volume (pos-db-data).
echo Close any Desktop POS / Metro windows manually.
timeout /t 4 /nobreak >nul

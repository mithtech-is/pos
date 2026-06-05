@echo off
setlocal enabledelayedexpansion
title CounterFlow POS - Demo Launcher
cd /d "%~dp0"

echo ============================================
echo    CounterFlow POS - one-click demo launcher
echo ============================================
echo.

REM --- 0. First-run: install desktop app dependencies ---
if not exist "node_modules" (
  echo First run detected - installing dependencies. This can take a few minutes...
  call npm install
  if errorlevel 1 ( echo ERROR: npm install failed. & pause & exit /b 1 )
)

REM --- 1. Ensure the Docker engine is running ---
echo [1/5] Checking Docker engine...
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker engine not running - launching Docker Desktop...
  if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  ) else (
    echo ERROR: Docker Desktop not found. Please start it manually, then re-run.
    pause & exit /b 1
  )
  echo Waiting for the Docker engine to come up...
  :waitdocker
  timeout /t 3 /nobreak >nul
  docker info >nul 2>&1
  if errorlevel 1 goto waitdocker
)
echo      Docker engine is ready.
echo.

REM --- 2. Start backend + database ---
echo [2/5] Starting backend + database (docker compose)...
docker compose up -d --build
if errorlevel 1 ( echo ERROR: docker compose failed. & pause & exit /b 1 )
echo.

REM --- 3. Wait for the backend to report healthy on :9000 ---
echo [3/5] Waiting for the backend at http://localhost:9000 ...
set /a tries=0
:waithealth
set /a tries+=1
timeout /t 3 /nobreak >nul
set CODE=000
for /f %%c in ('curl -s -o nul -w "%%{http_code}" http://localhost:9000/health 2^>nul') do set CODE=%%c
if not "!CODE!"=="200" (
  if !tries! GEQ 100 ( echo ERROR: backend did not become healthy in time. & pause & exit /b 1 )
  goto waithealth
)
echo      Backend is healthy.
echo.

REM --- 4. Seed demo data the first time (skipped if catalog already has products) ---
echo [4/5] Checking demo data...
set CNT=0
for /f "usebackq tokens=* delims= " %%i in (`docker exec pos-db psql -U medusa -d counterflow_pos -t -A -c "select count(*) from product" 2^>nul`) do set CNT=%%i
if "!CNT!"=="" set CNT=0
if "!CNT!"=="0" (
  echo      Empty catalog - seeding products, logins and prices...
  docker compose exec -T backend sh -c "npx medusa exec ./src/scripts/seed-counterflow-products.ts && npx medusa exec ./src/scripts/seed-users.ts && npx medusa exec ./src/scripts/fix-prices.ts"
  REM Make every seeded product always-sellable (no stock blocking during the demo).
  docker exec pos-db psql -U medusa -d counterflow_pos -c "update product_variant set manage_inventory=false where manage_inventory=true" >nul 2>&1
) else (
  echo      Catalog already has !CNT! product(s) - skipping seed.
)
echo.

REM --- 5. Open admin site + launch the desktop POS ---
echo [5/5] Opening admin site and launching the desktop POS...
start "" http://localhost:9000/app
start "CounterFlow Desktop POS" cmd /k "npm --workspace apps/pos-app run dev:electron"

echo.
echo ============================================
echo    READY FOR DEMO
echo    Admin  : http://localhost:9000/app
echo    Login  : manager@pos.local  /  manager12345
echo    The desktop POS window is opening now.
echo ============================================
echo This launcher window can be closed once the POS window appears.
timeout /t 8 /nobreak >nul
endlocal

@echo off
setlocal enabledelayedexpansion
title CounterFlow POS - Mobile (Expo on reserved port 8088)
cd /d "%~dp0\apps\mobile-pos"

REM This app owns ONE dedicated Expo/Metro dev-server port. 8088 is chosen on
REM purpose (NOT Expo's default 8081) so other Expo projects never collide with
REM it. The link is therefore always exp://<your-lan-ip>:8088.
set "EXPO_PORT=8088"

echo ============================================
echo    CounterFlow POS - mobile (Expo Metro)
echo    Reserved dev-server port: %EXPO_PORT%
echo ============================================
echo.

echo [1/3] Reserving port %EXPO_PORT% (stopping anything already on it)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%EXPO_PORT%" ^| findstr "LISTENING"') do (
  echo       - port %EXPO_PORT% held by PID %%a, stopping it...
  taskkill /F /PID %%a >nul 2>&1
)

echo [2/3] Detecting this PC's Wi-Fi / LAN IP...
set "LANIP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  if not defined LANIP set "LANIP=%%a"
)
set "LANIP=%LANIP: =%"
if "%LANIP%"=="" set "LANIP=[YOUR-PC-LAN-IP]"

echo.
echo ============================================
echo  On your phone (same Wi-Fi), open Expo Go and connect to:
echo.
echo       exp://%LANIP%:%EXPO_PORT%
echo.
echo  Backend URL is set in apps\mobile-pos\.env (EXPO_PUBLIC_POS_BACKEND_URL).
echo  Make sure the backend is running (start-demo.bat) and your PC firewall
echo  allows inbound %EXPO_PORT% and 9000 on the local network.
echo ============================================
echo.

echo [3/3] Starting Expo on the reserved port %EXPO_PORT%...
npx expo start --port %EXPO_PORT%

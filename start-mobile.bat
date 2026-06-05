@echo off
title CounterFlow POS - Mobile (Expo)
cd /d "%~dp0\apps\mobile-pos"

echo ============================================
echo    CounterFlow POS - mobile (Expo Metro)
echo ============================================
echo.
echo Make sure the backend is already running (start-demo.bat).
echo.
echo On your phone (same Wi-Fi), open Expo Go and connect to:
echo     exp://[YOUR-PC-LAN-IP]:8081
echo.
echo The app talks to the backend URL set in apps\mobile-pos\.env
echo (EXPO_PUBLIC_POS_BACKEND_URL). Update it if your PC's IP changes.
echo.
npx expo start

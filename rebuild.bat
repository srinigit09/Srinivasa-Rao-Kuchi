@echo off
echo ===================================================
echo   Panic Alarm Server — Quick Rebuild Tool (Windows)
echo ===================================================
echo.
echo [1/2] Preparing dependencies...
cd server
call npm install
echo.
echo [2/2] Packaging the installer...
call npm run build-win
echo.
echo ===================================================
echo   REBUILD SUCCESSFUL!
echo   Your new installer is ready in:
echo   server/dist/
echo ===================================================
pause

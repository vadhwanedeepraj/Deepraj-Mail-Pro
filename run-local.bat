@echo off
title Deepraj Mail Pro - Launcher
echo ===================================================
echo ✨ Deepraj Mail Pro - Automated Local Launcher ✨
echo ===================================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed! Please install Node.js v18 or higher to run this application.
    pause
    exit /b
)

:: Check and install root dependencies if node_modules doesn't exist
if not exist node_modules (
    echo [INFO] Installing root dependencies...
    call npm install
)

:: Check and install backend/frontend dependencies if missing
if not exist backend\node_modules (
    echo [INFO] Installing backend dependencies...
    cd backend
    call npm install
    cd ..
)

if not exist frontend\node_modules (
    echo [INFO] Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

echo.
echo [SUCCESS] All dependencies are verified and installed!
echo [INFO] Starting Backend Server (Port 3001) in a background window...
start "Deepraj Mail Pro - Backend" cmd /c "npm run dev:backend"

echo [INFO] Starting Frontend React App (Port 3000)...
echo.
npm run dev:frontend

pause

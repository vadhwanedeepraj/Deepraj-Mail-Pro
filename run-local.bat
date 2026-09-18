@echo off
title Deepraj Mail Pro — Local Launcher
echo.
echo ===================================================
echo   Deepraj Mail Pro — Automated Local Launcher
echo ===================================================
echo.

:: ── Node.js Check ─────────────────────────────────────────────────────────────
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo         Please install Node.js v18 or higher: https://nodejs.org
    pause
    exit /b 1
)

for /f "tokens=1 delims=v." %%i in ('node -v') do set NODE_MAJOR=%%i
if %NODE_MAJOR% lss 18 (
    echo [WARN] Node.js version is below v18. Some features may not work correctly.
    echo        Detected: && node -v
)

:: ── PostgreSQL Connectivity Check ─────────────────────────────────────────────
echo [INFO] Checking database connectivity...

:: Try to find psql or rely on docker-compose
where psql >nul 2>nul
if %errorlevel% equ 0 (
    psql "postgresql://postgres:root@localhost:5432/email_dispatcher" -c "SELECT 1" >nul 2>nul
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Cannot connect to PostgreSQL at localhost:5432
        echo.
        echo   Option A - Start via Docker (recommended):
        echo     docker-compose up -d db redis
        echo.
        echo   Option B - Start PostgreSQL manually and ensure:
        echo     1. PostgreSQL service is running
        echo     2. Database 'email_dispatcher' exists
        echo     3. User 'postgres' has password 'root'
        echo.
        echo   Then run this script again.
        echo.
        pause
        exit /b 1
    )
    echo [OK]    PostgreSQL is reachable.
) else (
    :: psql not found — check if Docker is available as fallback
    where docker >nul 2>nul
    if %errorlevel% equ 0 (
        echo [INFO] psql not found. Checking if Docker Postgres is running...
        docker ps --filter "name=edp_postgres" --filter "status=running" --quiet >nul 2>nul
        if %errorlevel% neq 0 (
            echo.
            echo [INFO] Starting PostgreSQL and Redis via Docker Compose...
            docker-compose up -d db redis
            echo [INFO] Waiting 10 seconds for database to initialize...
            timeout /t 10 /nobreak >nul
        ) else (
            echo [OK]    Docker PostgreSQL container is running.
        )
    ) else (
        echo [WARN] Neither psql nor docker found. Cannot verify database connectivity.
        echo        Make sure PostgreSQL is running before the backend starts.
    )
)

:: ── Install Dependencies ───────────────────────────────────────────────────────
if not exist node_modules (
    echo [INFO] Installing root dependencies...
    call npm install
)

if not exist backend\node_modules (
    echo [INFO] Installing backend dependencies...
    cd backend
    call npm install
    cd ..
)

if not exist frontend\node_modules (
    echo [INFO] Installing frontend dependencies...
    cd frontend
    call npm install --legacy-peer-deps
    cd ..
)

:: ── Start Application ─────────────────────────────────────────────────────────
echo.
echo [OK]    All dependencies verified.
echo [INFO]  Starting Backend (Port 3001) in background window...
echo [INFO]  Starting Frontend React App (Port 3000)...
echo.
echo   Open: http://localhost:3000
echo   Admin login: admin@gmail.com / admin123456
echo   (First login uses credentials from backend\.env)
echo.

start "Deepraj Mail Pro - Backend" cmd /k "cd /d "%~dp0" && npm run dev:backend"
npm run dev:frontend

@echo off
setlocal
if not exist .env (
  copy .env.example .env >nul
  echo Created .env from .env.example. Edit credentials and DATABASE_URL before continuing.
  exit /b 1
)
call npm install
if errorlevel 1 exit /b 1
call npm run db:setup
if errorlevel 1 exit /b 1
call npm run build
if errorlevel 1 exit /b 1
echo Setup complete. Run npm start to launch Rekap Baris.

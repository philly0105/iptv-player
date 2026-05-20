@echo off
cd /d "C:\Users\aideo\OneDrive\Desktop\Claude Code Projects\IPTV-viewer-and-downloader-main"

:: Kill any existing process on port 3000 so a fresh server always starts
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Start the server minimized
start /MIN "IPTV Player" node server/index.js

:: Wait for server to be ready then open the auto-login URL
timeout /t 3 /nobreak >nul
start http://localhost:3000/api/auth/autologin

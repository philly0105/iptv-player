@echo off
cd /d "C:\Users\aideo\Projects\IPTV-viewer-and-downloader-main"
set PORT=3003

rem Kill any server already listening on the port, then restart
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    echo Stopping existing server PID %%P ...
    taskkill /F /PID %%P >nul 2>&1
)

start /MIN "IPTV Player" node server/index.js
timeout /t 3 /nobreak >nul
start http://localhost:3003/api/auth/autologin

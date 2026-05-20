@echo off
cd /d "C:\Users\aideo\OneDrive\Desktop\Claude Code Projects\IPTV-viewer-and-downloader-main"
set PORT=3003
start /MIN "IPTV Player" node server/index.js
timeout /t 3 /nobreak >nul
start http://localhost:3003/api/auth/autologin

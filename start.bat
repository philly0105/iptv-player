@echo off
cd /d "C:\Users\aideo\OneDrive\Desktop\Claude Code Projects\IPTV-viewer-and-downloader-main"
start /MIN "IPTV Player" node server/index.js
timeout /t 2 /nobreak >nul
start http://localhost:3000/api/auth/autologin

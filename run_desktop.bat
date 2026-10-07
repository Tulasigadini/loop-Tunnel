@echo off
title SHARE PORT Desktop (Lightweight WebView2)
echo ========================================================
echo   ⚡ Starting SHARE PORT (Native WebView2 Desktop)
echo   Architecture: Lightweight WebView2 (~0.88 MB MSIX)
echo ========================================================
cd /d "%~dp0"

if not exist "webview2\bin\SHARE-PORT.exe" (
    echo Building native WebView2 host...
    powershell -ExecutionPolicy Bypass -File "webview2\scripts\build.ps1"
)

if not exist "dist\app.html" (
    echo Building React bundle...
    call npm run build
)

start "" /d "%~dp0webview2\bin" "%~dp0webview2\bin\SHARE-PORT.exe"

@echo off
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Virtual environment not found. Running setup.bat...
    call setup.bat
    exit /b
)

start "" .venv\Scripts\pythonw.exe app\main.py %*

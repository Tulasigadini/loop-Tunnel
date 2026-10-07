# PowerShell launcher for SHARE PORT Desktop
$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
Set-Location $ScriptDir

powershell -ExecutionPolicy Bypass -File (Join-Path $ScriptDir "webview2\scripts\run.ps1")

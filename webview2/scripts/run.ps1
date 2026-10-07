# Launch Script for SHARE PORT WebView2 Desktop Application
$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$RepoRoot = Resolve-Path (Join-Path $ProjectRoot "..")
Set-Location $RepoRoot

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  SHARE PORT - Native WebView2 Desktop (Lightweight)    " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$ExePath = Join-Path $ProjectRoot "bin\SHARE-PORT.exe"
$DistHtml = Join-Path $RepoRoot "dist\app.html"

$SrcFiles = Get-ChildItem -Path (Join-Path $RepoRoot "src") -Recurse -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not (Test-Path $DistHtml) -or ($SrcFiles -and $SrcFiles.LastWriteTime -gt (Get-Item $DistHtml).LastWriteTime)) {
    Write-Host "Building React frontend..." -ForegroundColor Yellow
    & npm run build
}

$CsFiles = Get-ChildItem -Path (Join-Path $ProjectRoot "src") -Recurse -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not (Test-Path $ExePath) -or ($CsFiles -and $CsFiles.LastWriteTime -gt (Get-Item $ExePath).LastWriteTime)) {
    Write-Host "Building native WebView2 host..." -ForegroundColor Yellow
    & powershell -ExecutionPolicy Bypass -File (Join-Path $ScriptDir "build.ps1")
}

$BinDir = Split-Path $ExePath
Start-Process -FilePath $ExePath -WorkingDirectory $BinDir
Write-Host "Application launched successfully." -ForegroundColor Cyan

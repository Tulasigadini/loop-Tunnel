# PowerShell Build Script for SHARE PORT WebView2 Host (Standalone Single-EXE & Portable)
param(
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$RepoRoot = Resolve-Path (Join-Path $ProjectRoot "..")

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Compiling SHARE PORT Native WebView2 Host (C# / .NET)   " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$CscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $CscPath)) {
    Write-Error "Microsoft .NET C# compiler (csc.exe) not found at: $CscPath"
    exit 1
}

$LibDir = Join-Path $ProjectRoot "lib"
$SrcDir = Join-Path $ProjectRoot "src"
$OutDir = Join-Path $ProjectRoot "bin"
$AssetsDir = Join-Path $ProjectRoot "assets"

if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

$IconPath = Join-Path $RepoRoot "app_icon.ico"
$IconArg = if (Test-Path $IconPath) { "/win32icon:$IconPath" } else { "" }

$SourceFiles = Get-ChildItem -Path $SrcDir -Filter "*.cs" -Recurse | Select-Object -ExpandProperty FullName

$OutExe = Join-Path $OutDir "SHARE-PORT.exe"

# Prepare embedded dist archive if dist exists
$EmbeddedDistZip = Join-Path $OutDir "dist_embedded.zip"
if (Test-Path (Join-Path $RepoRoot "dist")) {
    Write-Host "Compressing dist folder for embedded standalone runtime..." -ForegroundColor Yellow
    if (Test-Path $EmbeddedDistZip) { Remove-Item $EmbeddedDistZip -Force }
    Compress-Archive -Path (Join-Path $RepoRoot "dist\*") -DestinationPath $EmbeddedDistZip -Force
}

$CscArgs = @(
    "/target:winexe",
    "/platform:x64",
    "/optimize+",
    "/reference:System.dll",
    "/reference:System.Core.dll",
    "/reference:System.Windows.Forms.dll",
    "/reference:System.Drawing.dll",
    "/reference:System.Web.dll",
    "/reference:System.Web.Extensions.dll",
    "/reference:System.IO.Compression.dll",
    "/reference:System.IO.Compression.FileSystem.dll",
    "/reference:$LibDir\Microsoft.Web.WebView2.Core.dll",
    "/reference:$LibDir\Microsoft.Web.WebView2.WinForms.dll",
    "/resource:$LibDir\Microsoft.Web.WebView2.Core.dll,Microsoft.Web.WebView2.Core.dll",
    "/resource:$LibDir\Microsoft.Web.WebView2.WinForms.dll,Microsoft.Web.WebView2.WinForms.dll",
    "/resource:$LibDir\WebView2Loader.dll,WebView2Loader.dll",
    "/out:$OutExe"
)

if (Test-Path $EmbeddedDistZip) {
    $CscArgs += "/resource:$EmbeddedDistZip,dist.zip"
}

if ($IconArg) {
    $CscArgs += $IconArg
}

$CscArgs += $SourceFiles

Write-Host "Checking for running instances..." -ForegroundColor Yellow
Get-Process -Name "SHARE-PORT" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300

Write-Host "Compiling source files into standalone single-executable..." -ForegroundColor Yellow
& $CscPath $CscArgs
if ($LASTEXITCODE -ne 0) {
    Write-Error "C# Compilation failed."
    exit 1
}

Write-Host "Copying runtime dependencies alongside EXE..." -ForegroundColor Yellow
Copy-Item "$LibDir\Microsoft.Web.WebView2.Core.dll" -Destination "$OutDir\" -Force
Copy-Item "$LibDir\Microsoft.Web.WebView2.WinForms.dll" -Destination "$OutDir\" -Force
Copy-Item "$LibDir\WebView2Loader.dll" -Destination "$OutDir\" -Force

if (Test-Path "$AssetsDir\landing.html") {
    $OutAssets = Join-Path $OutDir "assets"
    if (-not (Test-Path $OutAssets)) { New-Item -ItemType Directory -Path $OutAssets -Force | Out-Null }
    Copy-Item "$AssetsDir\landing.html" -Destination "$OutAssets\" -Force
}

if (Test-Path "$RepoRoot\app_icon.ico") {
    Copy-Item "$RepoRoot\app_icon.ico" -Destination "$OutDir\" -Force
}
if (Test-Path "$RepoRoot\public\logo.png") {
    Copy-Item "$RepoRoot\public\logo.png" -Destination "$OutDir\" -Force
}

if (Test-Path "$RepoRoot\dist") {
    $OutDist = Join-Path $OutDir "dist"
    if (Test-Path $OutDist) { Remove-Item -Path $OutDist -Recurse -Force }
    Copy-Item "$RepoRoot\dist" -Destination "$OutDir\dist" -Recurse -Force
}

# Clean temporary embedded zip from bin
if (Test-Path $EmbeddedDistZip) {
    Remove-Item $EmbeddedDistZip -Force
}

# Copy compiled executable to root dist folder for easy access
Copy-Item $OutExe -Destination (Join-Path $RepoRoot "dist\SHARE-PORT.exe") -Force

# Create a zip for portable distribution to other computers
$PortableZip = Join-Path $RepoRoot "dist\SHARE-PORT-v2.0.0-Portable.zip"
Write-Host "Creating portable distribution package: $PortableZip..." -ForegroundColor Yellow
if (Test-Path $PortableZip) { Remove-Item $PortableZip -Force }
Compress-Archive -Path "$OutDir\*" -DestinationPath $PortableZip -Force

# Create convenient 1-click installer batch script
$InstallBat = Join-Path $RepoRoot "dist\Install-SharePort.bat"
$BatContent = @"
@echo off
setlocal
echo ========================================================
echo   Installing SHARE PORT Desktop
echo ========================================================
set "TARGET_DIR=%LOCALAPPDATA%\Programs\SharePort"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
xcopy /E /Y /I "%~dp0..\webview2\bin\*" "%TARGET_DIR%\" >nul
powershell -Command "`$ws = New-Object -ComObject WScript.Shell; `$s = `$ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\SHARE PORT.lnk'); `$s.TargetPath = '%TARGET_DIR%\SHARE-PORT.exe'; `$s.IconLocation = '%TARGET_DIR%\SHARE-PORT.exe,0'; `$s.Save()"
echo.
echo Installation Complete!
echo A shortcut 'SHARE PORT' has been created on your Desktop.
echo Launching application...
start "" "%TARGET_DIR%\SHARE-PORT.exe"
exit /b 0
"@
[System.IO.File]::WriteAllText($InstallBat, $BatContent)

$ExeSize = (Get-Item $OutExe).Length / 1KB
Write-Host "`nCompilation Successful!" -ForegroundColor Green
Write-Host "Standalone Executable: $OutExe ($([math]::Round($ExeSize, 1)) KB)" -ForegroundColor Cyan
Write-Host "Portable Package     : $PortableZip" -ForegroundColor Cyan
Write-Host "One-Click Installer  : $InstallBat" -ForegroundColor Cyan

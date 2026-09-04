# PowerShell Build & Packaging Script for LLOOP PORT MSIX
param(
    [string]$IdentityName = "TulasiSaiKumarGadini.lloopPort",
    [string]$Publisher = "CN=6CF839FC-4A3A-426D-A404-46E8D530D908",
    [string]$PublisherDisplayName = "Tulasi Sai Kumar Gadini",
    [string]$Version = "1.0.20.0"
)

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Building SHARE PORT MSIX Package for MS Store  " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

# Determine Python & PyInstaller executables
$PythonExe = "python"
$PyInstallerExe = "pyinstaller"

if (Test-Path ".venv\Scripts\python.exe") {
    $PythonExe = (Resolve-Path ".venv\Scripts\python.exe").Path
}
if (Test-Path ".venv\Scripts\pyinstaller.exe") {
    $PyInstallerExe = (Resolve-Path ".venv\Scripts\pyinstaller.exe").Path
}

# 1. Build PyInstaller binary
Write-Host "`n[1/5] Building PyInstaller executable..." -ForegroundColor Yellow
& "$PyInstallerExe" SHARE-PORT.spec --noconfirm

if (-not (Test-Path "dist\SHARE-PORT.exe")) {
    Write-Error "PyInstaller build failed: dist\SHARE-PORT.exe not found."
    exit 1
}

# 2. Generate MSIX PNG assets
Write-Host "`n[2/5] Generating Store PNG Assets..." -ForegroundColor Yellow
& "$PythonExe" scripts\generate_msix_assets.py

# 3. Create msix_stage directory
Write-Host "`n[3/5] Setting up MSIX staging directory..." -ForegroundColor Yellow
$StageDir = Join-Path $ProjectRoot "msix_stage"
if (Test-Path $StageDir) {
    Remove-Item -Path $StageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $StageDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $StageDir "Assets") | Out-Null

# Copy executable and assets
Copy-Item "dist\SHARE-PORT.exe" -Destination "$StageDir\SHARE-PORT.exe"
Copy-Item "Assets\*" -Destination "$StageDir\Assets\" -Recurse

# Copy public folder items (excluding legacy compiled exes to keep package slim)
if (Test-Path "public") {
    $PublicStage = Join-Path $StageDir "public"
    New-Item -ItemType Directory -Path $PublicStage -Force | Out-Null
    Get-ChildItem "public" -Exclude "*.exe" | Copy-Item -Destination $PublicStage -Recurse
}

# 4. Generate AppxManifest.xml from template
Write-Host "`n[4/5] Creating AppxManifest.xml..." -ForegroundColor Yellow
$TemplateContent = Get-Content "AppxManifest.xml.template" -Raw
$ManifestContent = $TemplateContent `
    -replace "PACKAGE_IDENTITY_NAME_PLACEHOLDER", $IdentityName `
    -replace "PUBLISHER_ID_PLACEHOLDER", $Publisher `
    -replace "PUBLISHER_DISPLAY_NAME_PLACEHOLDER", $PublisherDisplayName `
    -replace "1.0.20.0", $Version

Set-Content -Path "$StageDir\AppxManifest.xml" -Value $ManifestContent -Encoding UTF8

# 5. Locate MakeAppx.exe and package MSIX
Write-Host "`n[5/5] Packaging MSIX using MakeAppx.exe..." -ForegroundColor Yellow

$MakeAppxPath = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\makeappx.exe"
if (-not (Test-Path $MakeAppxPath)) {
    $MakeAppxPath = (Get-ChildItem -Path "C:\Program Files (x86)\Windows Kits\10\bin" -Filter "makeappx.exe" -Recurse | Select-Object -First 1).FullName
}

if (-not $MakeAppxPath) {
    Write-Error "Could not locate makeappx.exe from Windows SDK."
    exit 1
}

Write-Host "Found MakeAppx at: $MakeAppxPath" -ForegroundColor Green

$OutputFile = "dist\SHARE-PORT_v$Version.msix"
& "$MakeAppxPath" pack /d "$StageDir" /p "$OutputFile" /o

if (Test-Path $OutputFile) {
    $FileSize = (Get-Item $OutputFile).Length / 1MB
    Write-Host "`n==================================================" -ForegroundColor Green
    Write-Host " SUCCESS! MSIX Package Created Successfully!      " -ForegroundColor Green
    Write-Host " File: $OutputFile ($([math]::Round($FileSize, 2)) MB)" -ForegroundColor Yellow
    Write-Host "==================================================" -ForegroundColor Green
} else {
    Write-Error "Packaging failed: $OutputFile was not created."
}

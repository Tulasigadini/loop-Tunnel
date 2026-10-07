# PowerShell Build & Packaging Script for SHARE PORT (Electron + React) MSIX
param(
    [string]$IdentityName = "TulasiSaiKumarGadini.shareport",
    [string]$Publisher = "CN=6CF839FC-4A3A-426D-A404-46E8D530D908",
    [string]$PublisherDisplayName = "Tulasi Sai Kumar Gadini",
    [string]$Version = "1.0.30.0"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Building Optimized SHARE PORT (React + Electron) MSIX   " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

# 1. Compile React Frontend
Write-Host "`n[1/5] Building React Frontend with Vite..." -ForegroundColor Yellow
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "React Vite build failed."
    exit 1
}

if (-not (Test-Path "dist\app.html")) {
    Write-Error "dist\app.html not found. React build did not generate application bundle."
    exit 1
}

# 2. Generate Store PNG Assets
Write-Host "`n[2/5] Generating Store PNG Assets..." -ForegroundColor Yellow
$PythonExe = "python"
if (Test-Path ".venv\Scripts\python.exe") {
    $PythonExe = (Resolve-Path ".venv\Scripts\python.exe").Path
}

& "$PythonExe" scripts\generate_msix_assets.py

# 3. Setup MSIX Staging Directory with Optimized Electron Runtime
Write-Host "`n[3/5] Setting up MSIX staging directory with Electron..." -ForegroundColor Yellow
$StageDir = Join-Path $ProjectRoot "msix_stage"
if (Test-Path $StageDir) {
    Remove-Item -Path $StageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $StageDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $StageDir "Assets") | Out-Null

$ElectronDist = Join-Path $ProjectRoot "node_modules\electron\dist"
if (-not (Test-Path $ElectronDist)) {
    Write-Error "Electron binary not found at node_modules\electron\dist. Please run 'npm install'."
    exit 1
}

# Copy Electron prebuilt runtime
Copy-Item "$ElectronDist\*" -Destination $StageDir -Recurse

# Rename executable to SHARE-PORT.exe
if (Test-Path "$StageDir\electron.exe") {
    Rename-Item "$StageDir\electron.exe" "SHARE-PORT.exe"
}

# Clean default electron app
if (Test-Path "$StageDir\resources\default_app.asar") {
    Remove-Item "$StageDir\resources\default_app.asar" -Force
}

# --- PRUNING OPTIMIZATIONS (Save ~80+ MB uncompressed) ---
Write-Host "  -> Pruning unused localization language packs (~60 MB)..." -ForegroundColor Gray
if (Test-Path "$StageDir\locales") {
    Get-ChildItem "$StageDir\locales\*.pak" | Where-Object { $_.Name -ne 'en-US.pak' -and $_.Name -ne 'en-GB.pak' } | Remove-Item -Force
}

Write-Host "  -> Pruning large Chromium license text blob (~20 MB)..." -ForegroundColor Gray
if (Test-Path "$StageDir\LICENSES.chromium.html") {
    Set-Content -Path "$StageDir\LICENSES.chromium.html" -Value "Chromium and Electron components under respective BSD/MIT licenses." -Force
}

Write-Host "  -> Pruning unneeded 3D WebGPU shader compilers saves ~31 MB uncompressed..." -ForegroundColor Gray
Remove-Item -Path "$StageDir\dxcompiler.dll" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$StageDir\dxil.dll" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$StageDir\vk_swiftshader.dll" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$StageDir\vk_swiftshader_icd.json" -Force -ErrorAction SilentlyContinue

# Prepare application payload inside resources\app
$AppDir = Join-Path $StageDir "resources\app"
New-Item -ItemType Directory -Path $AppDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $AppDir "dist") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $AppDir "electron") | Out-Null

Copy-Item "package.json" -Destination "$AppDir\"
Copy-Item "app_icon.ico" -Destination "$AppDir\"
Copy-Item "electron\main.cjs" -Destination "$AppDir\electron\"
Copy-Item "electron\preload.cjs" -Destination "$AppDir\electron\"
Copy-Item "dist\app.html" -Destination "$AppDir\dist\"
Copy-Item "dist\assets" -Destination "$AppDir\dist\" -Recurse

if (Test-Path "public\logo.png") {
    $AppPublic = Join-Path $AppDir "public"
    New-Item -ItemType Directory -Path $AppPublic -Force | Out-Null
    Copy-Item "public\logo.png" -Destination "$AppPublic\logo.png"
    if (Test-Path "public\favicon.ico") {
        Copy-Item "public\favicon.ico" -Destination "$AppPublic\favicon.ico"
    }
}

# Copy Visual Assets for MSIX package
Copy-Item "Assets\*" -Destination "$StageDir\Assets\" -Recurse

# 4. Generate AppxManifest.xml from template
Write-Host "`n[4/5] Creating AppxManifest.xml..." -ForegroundColor Yellow
$TemplateContent = Get-Content "AppxManifest.xml.template" -Raw
$ManifestContent = $TemplateContent `
    -replace "PACKAGE_IDENTITY_NAME_PLACEHOLDER", $IdentityName `
    -replace "PUBLISHER_ID_PLACEHOLDER", $Publisher `
    -replace "PUBLISHER_DISPLAY_NAME_PLACEHOLDER", $PublisherDisplayName `
    -replace "PACKAGE_VERSION_PLACEHOLDER", $Version

Set-Content -Path "$StageDir\AppxManifest.xml" -Value $ManifestContent -Encoding UTF8

# 5. Package MSIX using MakeAppx.exe
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
if (Test-Path $OutputFile) {
    Remove-Item -Path $OutputFile -Force
}

& "$MakeAppxPath" pack /d "$StageDir" /p "$OutputFile" /o
if ($LASTEXITCODE -ne 0) {
    Write-Error "MakeAppx pack failed with exit code $LASTEXITCODE."
    exit 1
}

if (Test-Path $OutputFile) {
    $FileSize = (Get-Item $OutputFile).Length / 1MB
    Write-Host "`n===========================================================" -ForegroundColor Green
    Write-Host " SUCCESS! Optimized React + Electron MSIX Created!        " -ForegroundColor Green
    Write-Host " MSIX File: $OutputFile ($([math]::Round($FileSize, 2)) MB)" -ForegroundColor Yellow
    Write-Host "===========================================================" -ForegroundColor Green
} else {
    Write-Error "Packaging failed: $OutputFile was not created."
}

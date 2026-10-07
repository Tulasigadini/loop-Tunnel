# PowerShell Packaging Script for SHARE PORT WebView2 MSIX
param(
    [string]$IdentityName = "TulasiSaiKumarGadini.shareport",
    [string]$Publisher = "CN=6CF839FC-4A3A-426D-A404-46E8D530D908",
    [string]$PublisherDisplayName = "Tulasi Sai Kumar Gadini",
    [string]$Version = "1.0.32.0"
)

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
$RepoRoot = Resolve-Path (Join-Path $ProjectRoot "..")
Set-Location $RepoRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Packaging Lightweight SHARE PORT (React + WebView2) MSIX  " -ForegroundColor Cyan
Write-Host " Target Size: < 10 MB (Free Microsoft Store Limit: 25 MB) " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Compile React Frontend with Vite
Write-Host "`n[1/5] Building React Frontend with Vite..." -ForegroundColor Yellow
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "React Vite build failed."
    exit 1
}

# 2. Compile C# Native WebView2 Host
Write-Host "`n[2/5] Compiling Native C# WebView2 Host..." -ForegroundColor Yellow
& powershell -ExecutionPolicy Bypass -File (Join-Path $ScriptDir "build.ps1")
if ($LASTEXITCODE -ne 0) {
    Write-Error "C# WebView2 Host compilation failed."
    exit 1
}

# 3. Generate Visual Assets if needed
Write-Host "`n[3/5] Verifying Store Visual Assets..." -ForegroundColor Yellow
$RequiredAssets = @("Square44x44Logo.png", "Square150x150Logo.png", "StoreLogo.png", "Wide310x150Logo.png", "SplashScreen.png")
$MissingAssets = $RequiredAssets | Where-Object { -not (Test-Path "$RepoRoot\Assets\$_") }
if ($MissingAssets.Count -gt 0 -and (Test-Path "$RepoRoot\scripts\generate_msix_assets.py")) {
    $PyCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($PyCmd) {
        & $PyCmd.Source "$RepoRoot\scripts\generate_msix_assets.py"
    } else {
        Write-Warning "Missing visual assets ($($MissingAssets -join ', ')) and Python is not installed."
    }
}

# 4. Setup MSIX Staging Directory
Write-Host "`n[4/5] Setting up MSIX staging directory..." -ForegroundColor Yellow
$StageDir = Join-Path $RepoRoot "msix_stage"
if (Test-Path $StageDir) {
    Remove-Item -Path $StageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $StageDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $StageDir "Assets") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $StageDir "dist") | Out-Null

$BinDir = Join-Path $ProjectRoot "bin"
Copy-Item "$BinDir\SHARE-PORT.exe" -Destination "$StageDir\" -Force
Copy-Item "$BinDir\Microsoft.Web.WebView2.Core.dll" -Destination "$StageDir\" -Force
Copy-Item "$BinDir\Microsoft.Web.WebView2.WinForms.dll" -Destination "$StageDir\" -Force
Copy-Item "$BinDir\WebView2Loader.dll" -Destination "$StageDir\" -Force

if (Test-Path "$BinDir\assets\landing.html") {
    Copy-Item "$BinDir\assets\landing.html" -Destination "$StageDir\Assets\landing.html" -Force
}
if (Test-Path "$RepoRoot\app_icon.ico") {
    Copy-Item "$RepoRoot\app_icon.ico" -Destination "$StageDir\" -Force
}
if (Test-Path "$RepoRoot\public\logo.png") {
    Copy-Item "$RepoRoot\public\logo.png" -Destination "$StageDir\" -Force
}

# Copy Built React Frontend
Copy-Item "$RepoRoot\dist\app.html" -Destination "$StageDir\dist\" -Force
if (Test-Path "$RepoRoot\dist\index.html") {
    Copy-Item "$RepoRoot\dist\index.html" -Destination "$StageDir\dist\" -Force
}
Copy-Item "$RepoRoot\dist\assets" -Destination "$StageDir\dist\" -Recurse -Force

# Copy Visual Store Assets
Copy-Item "$RepoRoot\Assets\*" -Destination "$StageDir\Assets\" -Recurse -Force

# Generate AppxManifest.xml
$TemplateContent = Get-Content (Join-Path $RepoRoot "AppxManifest.xml.template") -Raw
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

$OutputFile = Join-Path $RepoRoot "dist\SHARE-PORT_v$Version.msix"
if (Test-Path $OutputFile) {
    Remove-Item -Path $OutputFile -Force
}

& "$MakeAppxPath" pack /d "$StageDir" /p "$OutputFile" /o
if ($LASTEXITCODE -ne 0) {
    Write-Error "MakeAppx pack failed with exit code $LASTEXITCODE."
    exit 1
}

# Clean up temporary staging directory
if (Test-Path $StageDir) {
    Remove-Item -Path $StageDir -Recurse -Force
}

if (Test-Path $OutputFile) {
    $FileSize = (Get-Item $OutputFile).Length / 1MB
    Write-Host "`n===========================================================" -ForegroundColor Green
    Write-Host " SUCCESS! Lightweight React + WebView2 MSIX Created!     " -ForegroundColor Green
    Write-Host " Output MSIX File: $OutputFile" -ForegroundColor Cyan
    Write-Host " Package Size    : $([math]::Round($FileSize, 2)) MB (Limit: 25 MB)" -ForegroundColor Yellow
    Write-Host " Store Ready     : YES (Uses Evergreen WebView2 Runtime)" -ForegroundColor Green
    Write-Host "===========================================================" -ForegroundColor Green
} else {
    Write-Error "Packaging failed: $OutputFile was not created."
}

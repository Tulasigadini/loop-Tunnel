# PowerShell Build & Packaging Script for SHARE PORT (React + WebView2 Architecture) MSIX
param(
    [string]$IdentityName = "TulasiSaiKumarGadini.shareport",
    [string]$Publisher = "CN=6CF839FC-4A3A-426D-A404-46E8D530D908",
    [string]$PublisherDisplayName = "Tulasi Sai Kumar Gadini",
    [string]$Version = "1.0.32.0"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Building Lightweight SHARE PORT (React + WebView2) MSIX  " -ForegroundColor Cyan
Write-Host " Target Size: < 10 MB (Free Microsoft Store Limit: 25 MB) " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

# Delegate to webview2 packaging script
$PackageScript = Join-Path $ProjectRoot "webview2\scripts\package_msix.ps1"
if (Test-Path $PackageScript) {
    & powershell -ExecutionPolicy Bypass -File $PackageScript `
        -IdentityName $IdentityName `
        -Publisher $Publisher `
        -PublisherDisplayName $PublisherDisplayName `
        -Version $Version
} else {
    Write-Error "Packaging script not found at: $PackageScript"
    exit 1
}

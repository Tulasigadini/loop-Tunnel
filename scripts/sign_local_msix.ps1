# Fast Local MSIX Signing Script
param(
    [string]$MsixPath = "dist\SHARE-PORT_v1.0.21.0.msix"
)

$ErrorActionPreference = "Stop"

$Subject = "CN=6CF839FC-4A3A-426D-A404-46E8D530D908"

# Locate or create local test cert
$Cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $Subject } | Select-Object -First 1

if (-not $Cert) {
    $Cert = New-SelfSignedCertificate -Type Custom `
        -Subject $Subject `
        -KeyUsage DigitalSignature `
        -FriendlyName "SHARE PORT Local Test Cert" `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3")
}

# Trust cert in CurrentUser\Root
$CertPath = Join-Path $PSScriptRoot "LocalTestCert.cer"
Export-Certificate -Cert $Cert -FilePath $CertPath -Force | Out-Null
try {
    Import-Certificate -FilePath $CertPath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
} catch {}

# Sign MSIX with Set-AuthenticodeSignature
Write-Host "Signing $MsixPath..." -ForegroundColor Yellow
Set-AuthenticodeSignature -FilePath "$MsixPath" -Certificate $Cert

Write-Host "SUCCESS! MSIX Package Signed for Local Installation!" -ForegroundColor Green

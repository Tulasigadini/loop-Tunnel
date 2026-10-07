# PowerShell Build Script for SHARE PORT WebView2 Host
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
    "/reference:$LibDir\Microsoft.Web.WebView2.Core.dll",
    "/reference:$LibDir\Microsoft.Web.WebView2.WinForms.dll",
    "/out:$OutExe"
)

if ($IconArg) {
    $CscArgs += $IconArg
}

$CscArgs += $SourceFiles

Write-Host "Compiling source files..." -ForegroundColor Yellow
& $CscPath $CscArgs
if ($LASTEXITCODE -ne 0) {
    Write-Error "C# Compilation failed."
    exit 1
}

Write-Host "Copying runtime dependencies..." -ForegroundColor Yellow
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

$ExeSize = (Get-Item $OutExe).Length / 1KB
Write-Host "`nCompilation Successful!" -ForegroundColor Green
Write-Host "Output Executable: $OutExe ($([math]::Round($ExeSize, 1)) KB)" -ForegroundColor Cyan

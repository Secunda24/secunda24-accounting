$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $projectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "Virtual environment not found. Run install_local_app.ps1 after Python is installed." -ForegroundColor Yellow
    exit 1
}

$env:BOOKKEEPING_PUBLIC_DEMO_MODE = "true"

Set-Location $projectRoot
& $venvPython -m uvicorn app.main:app --reload

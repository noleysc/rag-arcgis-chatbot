<#
.SYNOPSIS
  Local test environment: API on :8001 + React UI on :5173 against it.

.DESCRIPTION
  1. Optionally refreshes meeting videos from CHAMP (-SyncVideos).
  2. Starts the FastAPI backend (backend/.venv) on http://localhost:8001 with
     the bundled frontend off and rate limiting off, logging to
     .test_tmp/api.log.
  3. Waits for /ready (first run after a corpus change rebuilds the index,
     which can take 10+ minutes), then starts Vite on http://localhost:5173
     with VITE_API_BASE pointed at the local API, logging to .test_tmp/ui.log.

  Stop both with:  .\scripts\local_test_env.ps1 -Stop

.EXAMPLE
  .\scripts\local_test_env.ps1 -SyncVideos
#>
param(
  [switch]$SyncVideos,
  [switch]$Stop,
  [int]$ApiPort = 8001,
  [int]$UiPort = 5173
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Repo "backend"
$Frontend = Join-Path $Repo "frontend-react"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$LogDir = Join-Path $Repo ".test_tmp"
$PidFile = Join-Path $LogDir "test_env.pids"
New-Item -ItemType Directory -Force $LogDir | Out-Null

if ($Stop) {
  if (Test-Path $PidFile) {
    foreach ($procId in Get-Content $PidFile) {
      # /T takes the child processes too (uvicorn workers, node under npm).
      try { taskkill /PID $procId /T /F | Out-Null } catch {}
    }
    Remove-Item $PidFile -Force
  }
  # The tree kill can miss processes: the venv's python.exe is a launcher
  # whose real interpreter isn't always its child, and npm.cmd's node can
  # outlive cmd.exe. Whatever still listens on our ports is ours to stop.
  Get-NetTCPConnection -State Listen -LocalPort $ApiPort, $UiPort -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { try { Stop-Process -Id $_ -Force -ErrorAction Stop } catch {} }
  Write-Host "Test environment stopped."
  return
}

if (-not (Test-Path $Python)) {
  throw "No backend venv at $Python. Create it: python -m venv backend/.venv; backend/.venv/Scripts/pip install -r backend/requirements.txt"
}
$Node = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $Node) {
  $nodeDir = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Directory -Filter "OpenJS.NodeJS.LTS_*" -ErrorAction SilentlyContinue |
    ForEach-Object { Get-ChildItem $_.FullName -Directory -Filter "node-v*" } | Select-Object -First 1
  if (-not $nodeDir) { throw "npm not found on PATH." }
  $env:PATH = "$($nodeDir.FullName);$env:PATH"
}

if ($SyncVideos) {
  Write-Host "Syncing meeting videos from CHAMP..."
  & $Python (Join-Path $Backend "scripts\sync_meeting_videos.py")
}

$env:SERVE_FRONTEND = "false"
$env:ENABLE_RATE_LIMIT = "false"
$api = Start-Process -FilePath $Python -WorkingDirectory $Backend -PassThru -WindowStyle Hidden `
  -ArgumentList "-m", "uvicorn", "app:app", "--port", "$ApiPort" `
  -RedirectStandardOutput (Join-Path $LogDir "api.log") -RedirectStandardError (Join-Path $LogDir "api.err.log")
Set-Content $PidFile $api.Id
Write-Host "API starting on http://localhost:$ApiPort (pid $($api.Id)); waiting for /ready..."

$deadline = (Get-Date).AddMinutes(30)
while ((Get-Date) -lt $deadline) {
  try {
    $ready = Invoke-RestMethod "http://localhost:$ApiPort/ready" -TimeoutSec 5
    if ($ready) { break }
  } catch {}
  if ($api.HasExited) { throw "API exited early; see $LogDir\api.err.log" }
  Start-Sleep -Seconds 5
}

$env:VITE_API_BASE = "http://localhost:$ApiPort"
$ui = Start-Process -FilePath "npm.cmd" -WorkingDirectory $Frontend -PassThru -WindowStyle Hidden `
  -ArgumentList "run", "dev", "--", "--port", "$UiPort", "--strictPort" `
  -RedirectStandardOutput (Join-Path $LogDir "ui.log") -RedirectStandardError (Join-Path $LogDir "ui.err.log")
Add-Content $PidFile $ui.Id

Write-Host ""
Write-Host "Test environment up:"
Write-Host "  UI   http://localhost:$UiPort"
Write-Host "  API  http://localhost:$ApiPort  (/health, /docs)"
Write-Host "  Logs $LogDir\api*.log, ui*.log"
Write-Host "Stop:  .\scripts\local_test_env.ps1 -Stop"

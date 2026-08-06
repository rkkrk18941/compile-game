[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoPath = 'C:\Users\USER\Desktop\Claude\compile-game'
$nodePath = 'C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$codexPath = 'C:\Users\USER\.codex\plugins\.plugin-appserver\codex.exe'
$statePath = Join-Path $repoPath 'logs\cpu-training-inbox\automation'
$activityLog = Join-Path $statePath 'activity.log'
$lockPath = Join-Path $statePath 'run.lock'

New-Item -ItemType Directory -Path $statePath -Force | Out-Null

function Write-Activity([string]$message) {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss K'
  Add-Content -LiteralPath $activityLog -Value "[$stamp] $message" -Encoding utf8
}

function Invoke-TrainingFetch {
  $raw = & $nodePath (Join-Path $repoPath 'tools\fetch-cpu-training.mjs') 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "training fetch failed ($LASTEXITCODE): $($raw -join [Environment]::NewLine)"
  }
  $text = $raw -join [Environment]::NewLine
  try {
    return $text | ConvertFrom-Json
  } catch {
    throw "training fetch returned invalid JSON: $text"
  }
}

$lockStream = $null
try {
  try {
    $lockStream = [System.IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
  } catch [System.IO.IOException] {
    Write-Activity 'Skipped because another CPU training run is active.'
    exit 0
  }

  if (-not (Test-Path -LiteralPath $nodePath)) { throw "Node runtime not found: $nodePath" }
  if (-not (Test-Path -LiteralPath $codexPath)) { throw "Codex CLI not found: $codexPath" }

  Set-Location -LiteralPath $repoPath
  Write-Activity 'Checking the CPU training inbox.'
  $fetch = Invoke-TrainingFetch

  if (@($fetch.newlyLinkedRooms).Count -gt 0) {
    Write-Activity "Linked $(@($fetch.newlyLinkedRooms).Count) new phone inbox(es); waiting for upload."
    Start-Sleep -Seconds 25
    $fetch = Invoke-TrainingFetch
  }

  $pending = @($fetch.pendingMatches | Where-Object { $_ })
  if ($pending.Count -eq 0) {
    Write-Activity 'No pending match logs; Codex was not started.'
    exit 0
  }

  $runStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $runLog = Join-Path $statePath "codex-$runStamp.log"
  $lastMessage = Join-Path $statePath 'latest-report.md'
  $pendingText = $pending -join ', '
  Write-Activity "Starting headless Codex for $($pending.Count) pending match(es): $pendingText"

  $prompt = @"
This is the unattended COMPILE CPU training-log job. Work only in $repoPath.

Read AGENTS.md first. Fetch the inbox again with the bundled Node executable at:
$nodePath

Analyze every ID currently listed in pendingMatches, including at least these IDs detected by the preflight: $pendingText
Use the actual turn-by-turn records to identify reproducible CPU mistakes, excessive card/protocol use, missed wins or defenses, and incorrect rules/effect valuation. Implement only evidence-backed CPU improvements. Preserve unrelated user work and never commit logs, inbox data, authentication tokens, or credentials.

Before finishing, run both:
1. $nodePath tools/cpu-regression.mjs
2. $nodePath tools/sim-rules-test.mjs

After all relevant findings are implemented or deliberately accounted for and both tests pass, acknowledge only the analyzed match IDs with tools/fetch-cpu-training.mjs --ack. Fetch origin/main before publishing; integrate concurrent remote changes safely. Commit the code changes, push main to origin, and verify the public GitHub Pages build when code changed. If a safe improvement cannot be justified, leave the CPU unchanged but record why before acknowledging that match. Return a concise Japanese report.
"@

  & $codexPath exec --ephemeral -C $repoPath --sandbox danger-full-access -c 'approval_policy="never"' -o $lastMessage $prompt *> $runLog
  $codexExit = $LASTEXITCODE
  if ($codexExit -ne 0) {
    throw "headless Codex failed with exit code $codexExit; see $runLog"
  }
  Write-Activity "Headless Codex completed successfully; report: $lastMessage"
} catch {
  Write-Activity "ERROR: $($_.Exception.Message)"
  exit 1
} finally {
  if ($lockStream) { $lockStream.Dispose() }
}

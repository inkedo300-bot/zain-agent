# Shared helpers for the Arabic launch files in «ملف التشغيل».
# Saved as UTF-8 with BOM: Windows PowerShell 5.1 needs the BOM to read the Arabic text.
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path   # the project folder (where server.js is)
$EnvFile = Join-Path $Root '.env'
$LogDir = Join-Path $Root 'logs'
$Ports = @(8080, 8090)
$UiFont = New-Object System.Drawing.Font('Segoe UI', 10.5)
$UiBold = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)

# right-to-left message boxes (Windows lays the Arabic out properly)
function Say([string]$text, [string]$icon = 'Information') {
  [void][System.Windows.Forms.MessageBox]::Show($text, 'دفتر', 'OK', $icon, 'Button1', 'RightAlign, RtlReading')
}
function Ask([string]$text) {
  return ([System.Windows.Forms.MessageBox]::Show($text, 'دفتر', 'YesNo', 'Question', 'Button1', 'RightAlign, RtlReading')) -eq 'Yes'
}

# .env: KEY=value lines; comments and unknown lines are kept as they are
function Read-Keys {
  $keys = @{}
  if (Test-Path -LiteralPath $EnvFile) {
    foreach ($line in [IO.File]::ReadAllLines($EnvFile)) {
      if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$' -and $Matches[2]) { $keys[$Matches[1]] = $Matches[2].Trim('"', "'") }
    }
  }
  return $keys
}
function Save-Keys([hashtable]$new) {
  $lines = New-Object System.Collections.Generic.List[string]
  if (Test-Path -LiteralPath $EnvFile) { $lines.AddRange([string[]][IO.File]::ReadAllLines($EnvFile)) }
  elseif (Test-Path -LiteralPath (Join-Path $Root '.env.example')) { $lines.AddRange([string[]][IO.File]::ReadAllLines((Join-Path $Root '.env.example'))) }
  foreach ($k in $new.Keys) {
    $done = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match "^\s*$k\s*=") { $lines[$i] = "$k=$($new[$k])"; $done = $true; break }
    }
    if (-not $done) { $lines.Add("$k=$($new[$k])") }
  }
  # UTF-8 without BOM, so server.js reads the first key cleanly
  [IO.File]::WriteAllLines($EnvFile, $lines, (New-Object System.Text.UTF8Encoding($false)))
}

function Find-Node {
  $c = Get-Command node -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return $c.Source }
  foreach ($p in @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) {
    if ($p -and (Test-Path -LiteralPath $p)) { return $p }
  }
  return $null
}
function Get-Health([int]$port) {
  try { return Invoke-RestMethod -Uri "http://localhost:$port/api/health" -TimeoutSec 2 -UseBasicParsing } catch { return $null }
}
function Test-PortBusy([int]$port) {
  try { return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop) } catch { return $false }
}
# the process listening on a port (our node server), so it can be stopped with its children
function Stop-Port([int]$port) {
  $stopped = $false
  try {
    foreach ($c in Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop) {
      $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
      if ($p -and $p.ProcessName -eq 'node') { & taskkill.exe /PID $p.Id /T /F | Out-Null; $stopped = $true }
    }
  } catch {}
  return $stopped
}
# one line in Arabic about which model answers, from /api/health
function Describe-Health($h) {
  if (-not $h) { return 'الخادم ما يرد' }
  if (-not $h.llm) { return 'بدون مفاتيح: الوضع الاحتياطي (قواعد وقوالب بدون نموذج)' }
  $parts = @()
  if ($h.providers.gemini) { $parts += 'Gemini' }
  if ($h.providers.groq) { $parts += 'Groq' }
  $voice = if ($h.voice -and $h.voice.tts) { ' · الصوت: Grok' } else { '' }
  $text = @{ groq = 'Groq'; gemini = 'Gemini' }[[string]$h.provider]
  return "النموذج شغال: $($parts -join ' + ')، والنص يروح لـ $text$voice"
}

# Open the app in Microsoft Edge when it is there: Edge gives web pages Microsoft's natural Iraqi voices
# («باسل» and «رنا», free), so the answers are read in Iraqi. Chrome on Windows has no Arabic voice at all.
function Open-Site([string]$url) {
  $edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($edge) { Start-Process -FilePath $edge -ArgumentList $url } else { Start-Process $url }
}

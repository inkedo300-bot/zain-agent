# «تشغيل المحاكاة»: everything automatic. Node.js check (and install), keys, a free port,
# the server, the browser, and a small Arabic window that stops it all when closed.
. (Join-Path $PSScriptRoot 'common.ps1')
$script:server = $null
$script:port = 8080

function Start-Server {
  $node = Find-Node
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $script:port = if (Test-PortBusy 8080) { 8090 } else { 8080 }
  # cmd sends the server's output to logs\server.log; no window is shown
  $psi = New-Object System.Diagnostics.ProcessStartInfo 'cmd.exe', "/d /s /c `"`"$node`" server.js > logs\server.log 2>&1`""
  $psi.WorkingDirectory = $Root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.EnvironmentVariables['PORT'] = "$($script:port)"
  $script:server = [System.Diagnostics.Process]::Start($psi)
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 300
    $h = Get-Health $script:port
    if ($h) { return $h }
    if ($script:server.HasExited) { break }
  }
  $tail = if (Test-Path -LiteralPath (Join-Path $LogDir 'server.log')) { (Get-Content -LiteralPath (Join-Path $LogDir 'server.log') -Tail 8 -Encoding UTF8) -join "`n" } else { '' }
  throw "الخادم ما اشتغل.`n$tail"
}
function Stop-Server {
  if ($script:server -and -not $script:server.HasExited) { & taskkill.exe /PID $script:server.Id /T /F | Out-Null }
  $script:server = $null
}

function Show-Control($health) {
  $script:url = "http://localhost:$($script:port)"
  $f = New-Object System.Windows.Forms.Form
  $f.Text = 'دفتر · المحاكاة'
  $f.RightToLeft = 'Yes'; $f.RightToLeftLayout = $true
  $f.Size = New-Object System.Drawing.Size(520, 330)
  $f.StartPosition = 'CenterScreen'; $f.FormBorderStyle = 'FixedDialog'; $f.MaximizeBox = $false
  $f.Font = $UiFont; $f.BackColor = [System.Drawing.Color]::White; $f.TopMost = $false

  $title = New-Object System.Windows.Forms.Label
  $title.Text = '✓ المحاكاة شغالة'; $title.Font = $UiBold; $title.ForeColor = [System.Drawing.Color]::FromArgb(23, 132, 90)
  $title.AutoSize = $true; $title.Location = New-Object System.Drawing.Point(20, 18)

  $link = New-Object System.Windows.Forms.LinkLabel
  $link.Text = $script:url; $link.AutoSize = $true; $link.Location = New-Object System.Drawing.Point(20, 58)
  $link.RightToLeft = 'No'
  $link.add_LinkClicked({ Start-Process $script:url })

  $status = New-Object System.Windows.Forms.Label
  $status.Text = Describe-Health $health; $status.Size = New-Object System.Drawing.Size(470, 48); $status.Location = New-Object System.Drawing.Point(20, 92)

  $note = New-Object System.Windows.Forms.Label
  $note.Text = 'خلي هالنافذة مفتوحة طول ما تستخدم المحاكاة. إذا تسدها، المحاكاة توگف.'
  $note.ForeColor = [System.Drawing.Color]::DimGray; $note.Size = New-Object System.Drawing.Size(470, 44); $note.Location = New-Object System.Drawing.Point(20, 146)

  $open = New-Object System.Windows.Forms.Button
  $open.Text = 'افتح الموقع'; $open.Size = New-Object System.Drawing.Size(140, 40); $open.Location = New-Object System.Drawing.Point(20, 222)
  $open.BackColor = [System.Drawing.Color]::FromArgb(91, 42, 134); $open.ForeColor = [System.Drawing.Color]::White; $open.FlatStyle = 'Flat'
  $open.add_Click({ Start-Process $script:url })

  $keys = New-Object System.Windows.Forms.Button
  $keys.Text = 'إدخال المفاتيح'; $keys.Size = New-Object System.Drawing.Size(140, 40); $keys.Location = New-Object System.Drawing.Point(180, 222)
  $keys.add_Click({
    $saved = & (Join-Path $PSScriptRoot 'keys.ps1') -NoStart
    if ($saved) {
      # the server reads .env when it starts, so restart it with the new keys
      $status.Text = 'جاري إعادة التشغيل ويا المفاتيح الجديدة…'; $f.Refresh()
      Stop-Server; Start-Sleep -Milliseconds 600
      try { $h = Start-Server; $status.Text = Describe-Health $h; $script:url = "http://localhost:$($script:port)"; $link.Text = $script:url; Start-Process $script:url }
      catch { Say $_.Exception.Message 'Error' }
    }
  })

  $stop = New-Object System.Windows.Forms.Button
  $stop.Text = 'إيقاف وإغلاق'; $stop.Size = New-Object System.Drawing.Size(140, 40); $stop.Location = New-Object System.Drawing.Point(340, 222)
  $stop.add_Click({ $f.Close() })

  $f.Controls.AddRange(@($title, $link, $status, $note, $open, $keys, $stop))
  $f.add_FormClosing({ Stop-Server })
  [void]$f.ShowDialog()
}

try {
  # 1. Node.js: the server needs it; install it once if it is missing
  if (-not (Find-Node)) {
    if (-not (Ask "برنامج Node.js مو منصّب، والمحاكاة تحتاجه.`nأنصّبه هسه تلقائياً؟ (يحتاج نت وياخذ كم دقيقة)")) { exit }
    & winget.exe install -e --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements | Out-Null
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not (Find-Node)) { Say "ما گدرت أنصّب Node.js تلقائياً.`nنصّبه من nodejs.org، وبعدين افتح «تشغيل المحاكاة» مرة ثانية." 'Error'; exit }
  }
  # 2. already running? just open it
  foreach ($p in $Ports) {
    $h = Get-Health $p
    if ($h) { Start-Process "http://localhost:$p"; Say "المحاكاة شغالة من قبل، وفتحتها بالمتصفح.`n$(Describe-Health $h)"; exit }
  }
  # 3. keys: without them the demo still runs, on the rules
  $k = Read-Keys
  if (-not $k['GEMINI_API_KEY'] -and -not $k['GROQ_API_KEY']) {
    if (Ask "ماكو مفاتيح للنموذج، فالمحاكاة راح تشتغل بالوضع الاحتياطي (قواعد بدون ذكاء اصطناعي).`nتريد تدخل المفاتيح هسه؟") {
      [void](& (Join-Path $PSScriptRoot 'keys.ps1') -NoStart)
    }
  }
  # 4. server, browser, control window
  $h = Start-Server
  Start-Process "http://localhost:$($script:port)"
  Show-Control $h
} catch {
  Stop-Server
  Say ("صار خطأ وما گدرت أشغّل المحاكاة:`n" + $_.Exception.Message) 'Error'
}

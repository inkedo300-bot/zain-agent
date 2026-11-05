# «إدخال المفاتيح»: one window for the API keys. Each key is checked with its provider,
# then saved to .env in the project folder (.env is in .gitignore, so it never goes to GitHub).
# -NoStart: called from «تشغيل المحاكاة»; just save and return $true if anything was saved.
param([switch]$NoStart)
. (Join-Path $PSScriptRoot 'common.ps1')

$fields = @(
  @{ Name = 'GEMINI_API_KEY'; Title = 'مفتاح Gemini من Google'; Need = 'مهم: الفهم، والصوت، وقراءة صورة الدفتر'; Url = 'https://aistudio.google.com/app/apikey' },
  @{ Name = 'GROQ_API_KEY'; Title = 'مفتاح Groq'; Need = 'مستحسن: أسرع للنص، وWhisper لتحويل الصوت لنص'; Url = 'https://console.groq.com/keys' },
  @{ Name = 'XAI_API_KEY'; Title = 'مفتاح Grok من xAI'; Need = 'اختياري: صوت يقرا الأجوبة'; Url = 'https://console.x.ai' }
)

# ask the provider whether the key works: 'ok', 'bad' or 'unknown' (no internet, provider busy)
function Test-Key([string]$name, [string]$key) {
  try {
    switch ($name) {
      'GEMINI_API_KEY' { Invoke-RestMethod -Uri "https://generativelanguage.googleapis.com/v1beta/models?key=$key" -TimeoutSec 12 -UseBasicParsing | Out-Null }
      'GROQ_API_KEY' { Invoke-RestMethod -Uri 'https://api.groq.com/openai/v1/models' -Headers @{ Authorization = "Bearer $key" } -TimeoutSec 12 -UseBasicParsing | Out-Null }
      'XAI_API_KEY' { Invoke-RestMethod -Uri 'https://api.x.ai/v1/models' -Headers @{ Authorization = "Bearer $key" } -TimeoutSec 12 -UseBasicParsing | Out-Null }
    }
    return 'ok'
  } catch {
    $code = 0; try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    if ($code -in 400, 401, 403) { return 'bad' }
    return 'unknown'
  }
}

$saved = Read-Keys
$f = New-Object System.Windows.Forms.Form
$f.Text = 'دفتر · مفاتيح النماذج'
$f.RightToLeft = 'Yes'; $f.RightToLeftLayout = $true
$f.Size = New-Object System.Drawing.Size(600, 520)
$f.StartPosition = 'CenterScreen'; $f.FormBorderStyle = 'FixedDialog'; $f.MaximizeBox = $false
$f.Font = $UiFont; $f.BackColor = [System.Drawing.Color]::White

$intro = New-Object System.Windows.Forms.Label
$intro.Text = "حط المفاتيح مرة وحدة، وتنحفظ بملف الإعدادات داخل مجلد المشروع، وما تنرفع لـ GitHub.`nإذا الحقل محفوظ من قبل، اتركه فارغ حتى يبقى مثل ما هو."
$intro.Size = New-Object System.Drawing.Size(550, 48); $intro.Location = New-Object System.Drawing.Point(20, 14)
$f.Controls.Add($intro)

$boxes = @{}; $marks = @{}; $y = 72
foreach ($fd in $fields) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $fd.Title; $l.Font = $UiBold; $l.AutoSize = $true; $l.Location = New-Object System.Drawing.Point(20, $y)
  $n = New-Object System.Windows.Forms.Label
  $n.Text = $fd.Need; $n.ForeColor = [System.Drawing.Color]::DimGray; $n.AutoSize = $true; $n.Location = New-Object System.Drawing.Point(20, ($y + 26))
  $t = New-Object System.Windows.Forms.TextBox
  $t.Size = New-Object System.Drawing.Size(380, 28); $t.Location = New-Object System.Drawing.Point(20, ($y + 52))
  $t.UseSystemPasswordChar = $true; $t.RightToLeft = 'No'
  $m = New-Object System.Windows.Forms.Label
  $m.AutoSize = $true; $m.Location = New-Object System.Drawing.Point(410, ($y + 55))
  if ($saved[$fd.Name]) { $m.Text = 'محفوظ ✓'; $m.ForeColor = [System.Drawing.Color]::FromArgb(23, 132, 90) } else { $m.Text = 'فارغ'; $m.ForeColor = [System.Drawing.Color]::Gray }
  $g = New-Object System.Windows.Forms.LinkLabel
  $g.Text = 'منين أجيبه؟'; $g.AutoSize = $true; $g.Location = New-Object System.Drawing.Point(480, ($y + 55)); $g.Tag = $fd.Url
  $g.add_LinkClicked({ param($s) Start-Process $s.Tag })
  $f.Controls.AddRange(@($l, $n, $t, $m, $g))
  $boxes[$fd.Name] = $t; $marks[$fd.Name] = $m
  $y += 100
}

$show = New-Object System.Windows.Forms.CheckBox
$show.Text = 'اظهر المفاتيح'; $show.AutoSize = $true; $show.Location = New-Object System.Drawing.Point(20, ($y + 2))
$show.add_CheckedChanged({ foreach ($b in $boxes.Values) { $b.UseSystemPasswordChar = -not $show.Checked } })
$f.Controls.Add($show)

$script:result = $false
$ok = New-Object System.Windows.Forms.Button
$ok.Text = 'تحقق واحفظ'; $ok.Size = New-Object System.Drawing.Size(160, 42); $ok.Location = New-Object System.Drawing.Point(20, ($y + 40))
$ok.BackColor = [System.Drawing.Color]::FromArgb(91, 42, 134); $ok.ForeColor = [System.Drawing.Color]::White; $ok.FlatStyle = 'Flat'
$ok.add_Click({
  $new = @{}
  foreach ($fd in $fields) {
    $v = $boxes[$fd.Name].Text.Trim()
    if (-not $v) { continue }
    $marks[$fd.Name].Text = 'جاري التحقق…'; $marks[$fd.Name].ForeColor = [System.Drawing.Color]::Gray; $f.Refresh()
    $r = Test-Key $fd.Name $v
    if ($r -eq 'ok') { $marks[$fd.Name].Text = 'شغال ✓'; $marks[$fd.Name].ForeColor = [System.Drawing.Color]::FromArgb(23, 132, 90); $new[$fd.Name] = $v }
    elseif ($r -eq 'bad') {
      $marks[$fd.Name].Text = 'غلط ✗'; $marks[$fd.Name].ForeColor = [System.Drawing.Color]::FromArgb(195, 40, 61)
      if (Ask "$($fd.Title) يبين غلط (الشركة رفضته).`nأحفظه على كل حال؟") { $new[$fd.Name] = $v }
    } else { $marks[$fd.Name].Text = 'ما گدرت أتحقق'; $marks[$fd.Name].ForeColor = [System.Drawing.Color]::FromArgb(184, 110, 0); $new[$fd.Name] = $v }
    $f.Refresh()
  }
  if (-not $new.Count) { Say 'ما كتبت أي مفتاح جديد.'; return }
  Save-Keys $new
  $script:result = $true
  Say "انحفظت المفاتيح ✓`nبملف: $EnvFile"
  $f.Close()
})
$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = 'إلغاء'; $cancel.Size = New-Object System.Drawing.Size(120, 42); $cancel.Location = New-Object System.Drawing.Point(196, ($y + 40))
$cancel.add_Click({ $f.Close() })
$f.Controls.AddRange(@($ok, $cancel))
$f.AcceptButton = $ok
[void]$f.ShowDialog()

if ($NoStart) { return $script:result }

# opened on its own: offer to start (or restart) the simulation with the new keys
if ($script:result) {
  $running = $Ports | Where-Object { Get-Health $_ }
  if ($running) {
    if (Ask "المحاكاة شغالة هسه، ولازم تنعاد حتى تاخذ المفاتيح الجديدة.`nأعيد تشغيلها؟") { foreach ($p in $running) { [void](Stop-Port $p) }; Start-Sleep -Milliseconds 600; Start-Process powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$(Join-Path $PSScriptRoot 'run.ps1')`"" }
  } elseif (Ask 'تشغّل المحاكاة هسه؟') {
    Start-Process powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$(Join-Path $PSScriptRoot 'run.ps1')`""
  }
}

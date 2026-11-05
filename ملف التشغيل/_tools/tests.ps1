# «تشغيل الاختبارات»: runs every test file (no keys needed: the model is mocked) and shows the result.
. (Join-Path $PSScriptRoot 'common.ps1')
$node = Find-Node
if (-not $node) { Say 'برنامج Node.js مو منصّب. افتح «تشغيل المحاكاة» أول، وهو ينصّبه.' 'Error'; exit }
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$names = [ordered]@{
  'agent_llm' = 'مسار النموذج (فهم وصياغة)'; 'commands' = 'الأوامر (ذكّر، اطلب)'; 'security' = 'الأمان والخصوصية';
  'fraud' = 'فحص التحويل'; 'voice' = 'الصوت'; 'lexicon' = 'بنك كلمات اللهجة'; 'custagent' = 'وكيل الزبون'; 'heldout' = 'الأسئلة المحجوبة ما تغيرت'
}
$f = New-Object System.Windows.Forms.Form
$f.Text = 'دفتر · الاختبارات'; $f.RightToLeft = 'Yes'; $f.RightToLeftLayout = $true
$f.Size = New-Object System.Drawing.Size(760, 560); $f.StartPosition = 'CenterScreen'; $f.Font = $UiFont; $f.BackColor = [System.Drawing.Color]::White
$head = New-Object System.Windows.Forms.Label
$head.Text = 'جاري تشغيل الاختبارات…'; $head.Font = $UiBold; $head.AutoSize = $true; $head.Location = New-Object System.Drawing.Point(20, 16)
$box = New-Object System.Windows.Forms.TextBox
$box.Multiline = $true; $box.ScrollBars = 'Vertical'; $box.ReadOnly = $true; $box.RightToLeft = 'No'
$box.Font = New-Object System.Drawing.Font('Consolas', 9.5); $box.Location = New-Object System.Drawing.Point(20, 56); $box.Size = New-Object System.Drawing.Size(705, 440)
$f.Controls.AddRange(@($head, $box))
$f.add_Shown({
  $passed = 0; $failed = @()
  Push-Location -LiteralPath $Root
  foreach ($k in $names.Keys) {
    $out = (& $node "tests\$k.test.mjs" 2>&1 | Out-String)
    $good = $LASTEXITCODE -eq 0
    if ($good) { $passed++ } else { $failed += $names[$k] }
    $box.AppendText(("{0}  {1}  ({2})`r`n" -f ($(if ($good) { 'PASS' } else { 'FAIL' })), $k, $names[$k]))
    if (-not $good) { $box.AppendText(($out -replace "`n", "`r`n") + "`r`n") }
    $f.Refresh()
  }
  Pop-Location
  if ($failed.Count) { $head.Text = "✗ فشل $($failed.Count): $($failed -join '، ')"; $head.ForeColor = [System.Drawing.Color]::FromArgb(195, 40, 61) }
  else { $head.Text = "✓ كل الاختبارات نجحت ($passed ملفات)"; $head.ForeColor = [System.Drawing.Color]::FromArgb(23, 132, 90) }
})
[void]$f.ShowDialog()

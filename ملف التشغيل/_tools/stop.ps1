# «إيقاف المحاكاة»: stops the server if it is still running (for example after a crash of its window).
. (Join-Path $PSScriptRoot 'common.ps1')
$any = $false
foreach ($p in $Ports) { if (Stop-Port $p) { $any = $true } }
if ($any) { Say 'وگفت المحاكاة ✓' } else { Say 'المحاكاة مو شغالة أصلاً.' }

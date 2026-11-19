# إرسال تقارير التحصيل الأكاديمي من Outlook (حزمة من مسار).
# يقرأ manifest.csv، يعرض العدد وأول اسمين للتأكيد، وبعد «نعم» يرسل لكل طالب
# تقريره مدمجًا في نص البريد من حساب Outlook على هذا الجهاز. يحفظ result.csv.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest = Join-Path $dir 'manifest.csv'
$rtl = [System.Windows.Forms.MessageBoxOptions]::RtlReading -bor [System.Windows.Forms.MessageBoxOptions]::RightAlign
function Show-Box($text, $buttons = 'OK', $icon = 'Information') {
  return [System.Windows.Forms.MessageBox]::Show($text, 'مسار - إرسال التقارير', $buttons, $icon, 'Button1', $rtl)
}

if (-not (Test-Path $manifest)) {
  Show-Box "ما لقيت manifest.csv.`nفك ضغط الملف أولًا (زر يمين > استخراج الكل)، ثم شغّل SEND.bat من المجلد." 'OK' 'Warning' | Out-Null
  exit 1
}
$rows = @(Import-Csv -Path $manifest -Encoding UTF8)
$count = $rows.Count
if ($count -eq 0) { Show-Box 'القائمة فاضية.' 'OK' 'Warning' | Out-Null; exit 1 }
$sample = ($rows | Select-Object -First 2 | ForEach-Object { "• $($_.name)  <$($_.email)>" }) -join "`n"
$question = "سيتم إرسال $count رسالة من بريدك في Outlook، ولكل طالب تقريره داخل الرسالة.`n`nأول الرسائل:`n$sample`n`nهل تريد الإرسال الآن؟"
$answer = [System.Windows.Forms.MessageBox]::Show($question, 'مسار - تأكيد الإرسال', 'YesNo', 'Question', 'Button2', $rtl)
if ($answer -ne 'Yes') { Show-Box 'أُلغي الإرسال. ما انرسل شي.' | Out-Null; exit 0 }

try { $outlook = New-Object -ComObject Outlook.Application }
catch { Show-Box "ما قدرت أفتح Outlook على هذا الجهاز.`n$($_.Exception.Message)" 'OK' 'Error' | Out-Null; exit 1 }

$results = New-Object System.Collections.Generic.List[object]
$i = 0
foreach ($r in $rows) {
  $i++
  Write-Progress -Activity 'Sending reports' -Status "$i / $count" -PercentComplete ([int]($i * 100 / $count))
  try {
    $htmlPath = Join-Path $dir $r.htmlFile
    $html = [System.IO.File]::ReadAllText($htmlPath, [System.Text.Encoding]::UTF8)
    $mail = $outlook.CreateItem(0)
    $mail.To = $r.email
    $mail.Subject = $r.subject
    $mail.HTMLBody = $html
    $mail.Send()
    $results.Add([pscustomobject]@{ academicId = $r.academicId; status = 'sent'; at = (Get-Date).ToString('s'); error = '' })
  } catch {
    $results.Add([pscustomobject]@{ academicId = $r.academicId; status = 'failed'; at = (Get-Date).ToString('s'); error = $_.Exception.Message })
  }
  Start-Sleep -Milliseconds 800
}
Write-Progress -Activity 'Sending reports' -Completed
$out = Join-Path $dir 'result.csv'
$results | Export-Csv -Path $out -NoTypeInformation -Encoding UTF8
$sent = @($results | Where-Object { $_.status -eq 'sent' }).Count
$failed = $count - $sent
Show-Box "انرسل: $sent`nما انرسل: $failed`n`nارفع الملف result.csv (في نفس المجلد) في مسار من «رفع نتيجة الإرسال» عشان يتأشر على الطلاب." | Out-Null

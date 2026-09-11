# ملف تشغيل بنقرة واحدة (Windows) لتحديث معدلات الطلبة من شهادات PDF —
# بلا كتابة أي أمر: يفتح نافذة اختيار مجلد، ثم مربعَي حوار لاسم
# المستخدم/كلمة المرور، ثم يشغّل scripts/cowork-analyze-grades.mjs تلقائيًا.
# يُشغَّل عبر تحديث_المعدلات.bat (نقرة مزدوجة عليه هو المطلوب، لا على هذا الملف).
#
# هذا الملف يجب أن يبقى داخل scripts\launchers\ بنسختك المحلية من مستودع
# masar-app (يعتمد على مكانه لإيجاد جذر المشروع).

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type -AssemblyName System.Drawing

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
Set-Location $repoRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  [System.Windows.Forms.MessageBox]::Show("يبدو أن Node.js غير مثبّت على جهازك.`n`nثبّته أولاً من nodejs.org (النسخة LTS) ثم أعد تشغيل هذا الملف.", "تحديث معدلات الطلبة", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
  exit
}

$folderDialog = New-Object System.Windows.Forms.FolderBrowserDialog
$folderDialog.Description = "اختر مجلد شهادات الطلبة (PDF)"
if ($folderDialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit }
$folder = $folderDialog.SelectedPath

$modeChoice = [System.Windows.Forms.MessageBox]::Show("هل تريد معاينة فقط أولًا (بلا أي تعديل فعلي)؟`n`nنعم = معاينة فقط`nلا = تنفيذ فعلي مباشرة", "تحديث معدلات الطلبة", [System.Windows.Forms.MessageBoxButtons]::YesNoCancel, [System.Windows.Forms.MessageBoxIcon]::Question)
if ($modeChoice -eq [System.Windows.Forms.DialogResult]::Cancel) { exit }

$username = [Microsoft.VisualBasic.Interaction]::InputBox("اسم المستخدم أو الإيميل:", "تسجيل الدخول لمسار", "")
if ([string]::IsNullOrWhiteSpace($username)) { exit }

$form = New-Object System.Windows.Forms.Form
$form.Text = "تسجيل الدخول لمسار"
$form.Width = 340
$form.Height = 150
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false

$label = New-Object System.Windows.Forms.Label
$label.Text = "كلمة المرور:"
$label.Left = 15
$label.Top = 15
$label.AutoSize = $true
$form.Controls.Add($label)

$textbox = New-Object System.Windows.Forms.TextBox
$textbox.Left = 15
$textbox.Top = 40
$textbox.Width = 290
$textbox.UseSystemPasswordChar = $true
$form.Controls.Add($textbox)

$okButton = New-Object System.Windows.Forms.Button
$okButton.Text = "موافق"
$okButton.Left = 210
$okButton.Top = 75
$okButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.Controls.Add($okButton)
$form.AcceptButton = $okButton

$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) { exit }
$password = $textbox.Text
if ([string]::IsNullOrWhiteSpace($password)) { exit }

$env:MASAR_LOGIN_ID = $username
$env:MASAR_LOGIN_PASSWORD = $password

Write-Host "جارٍ التحضير (npm install)..."
npm install --silent

if ($modeChoice -eq [System.Windows.Forms.DialogResult]::Yes) {
  node scripts\cowork-analyze-grades.mjs "$folder" --dry-run
} else {
  node scripts\cowork-analyze-grades.mjs "$folder"
}

Write-Host ""
Write-Host "انتهى — اضغط أي مفتاح لإغلاق هذه النافذة..."
[void][System.Console]::ReadKey($true)

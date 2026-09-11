#!/bin/bash
# ملف تشغيل بنقرة واحدة (Mac) لتحديث معدلات الطلبة من شهادات PDF —
# بلا كتابة أي أمر: يفتح نافذة اختيار مجلد، ثم مربعَي حوار لاسم
# المستخدم/كلمة المرور، ثم يشغّل scripts/cowork-analyze-grades.mjs تلقائيًا.
#
# أول مرة فقط: قد يرفض macOS فتحه بنقرة عادية ("من مطوّر غير معروف") —
# اضغط بالزر الأيمن على الملف ثم اختر "فتح" مرة واحدة.
#
# هذا الملف يجب أن يبقى داخل scripts/launchers/ بنسختك المحلية من
# مستودع masar-app (يعتمد على مكانه لإيجاد جذر المشروع).

cd "$(dirname "$0")/../.." || { osascript -e 'display dialog "تعذّر إيجاد مجلد المشروع." buttons {"حسناً"}'; exit 1; }

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display dialog "يبدو أن Node.js غير مثبّت على جهازك.\n\nثبّته أولاً من nodejs.org (النسخة LTS) ثم أعد تشغيل هذا الملف." buttons {"حسناً"} with title "تحديث معدلات الطلبة" with icon caution'
  exit 1
fi

FOLDER=$(osascript -e 'POSIX path of (choose folder with prompt "اختر مجلد شهادات الطلبة (PDF):")' 2>/dev/null)
if [ -z "$FOLDER" ]; then exit 0; fi

MODE=$(osascript -e 'button returned of (display dialog "هل تريد معاينة فقط أولًا (بلا أي تعديل فعلي) أم التنفيذ الفعلي مباشرة؟" buttons {"معاينة فقط", "تنفيذ فعلي"} default button "معاينة فقط" with title "تحديث معدلات الطلبة")' 2>/dev/null)
if [ -z "$MODE" ]; then exit 0; fi

USERNAME=$(osascript -e 'text returned of (display dialog "اسم المستخدم أو الإيميل:" default answer "" with title "تسجيل الدخول لمسار")' 2>/dev/null)
if [ -z "$USERNAME" ]; then exit 0; fi

PASSWORD=$(osascript -e 'text returned of (display dialog "كلمة المرور:" default answer "" with hidden answer with title "تسجيل الدخول لمسار")' 2>/dev/null)
if [ -z "$PASSWORD" ]; then exit 0; fi

export MASAR_LOGIN_ID="$USERNAME"
export MASAR_LOGIN_PASSWORD="$PASSWORD"

echo "جارٍ التحضير (npm install)..."
npm install --silent

if [ "$MODE" = "معاينة فقط" ]; then
  node scripts/cowork-analyze-grades.mjs "$FOLDER" --dry-run
else
  node scripts/cowork-analyze-grades.mjs "$FOLDER"
fi

echo ""
echo "انتهى — اضغط أي مفتاح لإغلاق هذه النافذة..."
read -n 1 -s -r

@echo off
REM ملف تشغيل بنقرة واحدة (Windows) لتحديث معدلات الطلبة من شهادات PDF.
REM انقر مرتين على هذا الملف فقط — هو يشغّل تحديث_المعدلات.ps1 تلقائيًا
REM (بلا كتابة أي أمر ولا تعديل إعدادات PowerShell على جهازك).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0تحديث_المعدلات.ps1"

-- نُفّذ فعليًا عبر mcp__Supabase__apply_migration على مشروع wtbtgubycnmsytfythhb
-- (GUIDE) — هذا الملف نسخة موثَّقة بالمستودع، شغّله يدويًا بـSQL Editor لو
-- أُعيد بناء المشروع من الصفر.
--
-- عطل حقيقي بالإنتاج (2026-09-24): "تنزيل نسخة احتياطية الآن" يفشل بخطأ 500
-- في كل مرة. السبب الفعلي: دور authenticated له statement_timeout=8s (دور
-- anon له 3s)، وmasar_export_backup صار يجمّع courseGrades (45,000+ صفًا
-- بعد إضافتها بـ20260923_course_grades.sql) ضمن استعلام واحد يتجاوز هذي
-- المهلة بسهولة (~23 ميجابايت ناتج نهائي). الإصلاح: مهلة أعلى مضبوطة على
-- مستوى الدالة نفسها (SET على الدالة يطبَّق بكل استدعاء بغض النظر عن مهلة
-- الدور المتّصل)، بدل رفع مهلة الدور العامة (أوسع أثرًا من اللازم).

alter function public.masar_export_backup() set statement_timeout = '60s';
alter function public.masar_restore_backup(jsonb) set statement_timeout = '60s';

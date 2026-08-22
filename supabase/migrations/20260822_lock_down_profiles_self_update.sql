-- مسار — إصلاح أمني: منع تصعيد الصلاحيات الذاتي عبر جدول profiles.
--
-- المشكلة: سياسة profiles_update_self الحالية (راجع
-- 20260804_masar_core_schema.sql) تتحقق فقط من id = auth.uid()، وRLS في
-- Postgres يتحكم بالصفوف المسموح لمسها، وليس بالأعمدة. الصلاحية الممنوحة
-- كانت `grant update on public.profiles to authenticated` — بلا تحديد
-- أعمدة — فأي حساب مسجَّل دخوله (حتى غير إدمن) يقدر يرسل طلب PATCH مباشر
-- لواجهة PostgREST على صفه هو نفسه ويغيّر is_admin إلى true أو is_active،
-- رغم إن الواجهة (الكود بـ src/) لا تعرض أي زر لذلك — التحقق كان فقط
-- بالواجهة، لا بقاعدة البيانات، وهو بالضبط ما يمنعه هذا الإصلاح.
--
-- التطبيق نفسه لا يستدعي تحديث profiles من طرف المستخدم إطلاقًا (فقط
-- select عند تسجيل الدخول — راجع src/services/auth-service.js) فلا حاجة
-- لأي عمود قابل للتعديل الذاتي حاليًا؛ is_admin/is_active/email تبقى
-- محصورة بـ Edge Function admin-users (بمفتاح service_role اللي يتجاوز
-- RLS والصلاحيات العادية أصلًا، فهذا القيد لا يؤثر عليه).
--
-- تشغيله يدويًا عبر SQL Editor بلوحة تحكم مشروع Supabase (نفس بقية ملفات
-- supabase/migrations/) — رفعه لـ GitHub وحده لا يطبّقه.

begin;

drop policy if exists profiles_update_self on public.profiles;

revoke update on public.profiles from authenticated;

commit;

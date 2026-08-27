-- إزالة ميزة صور الطلبة بالكامل (قرار: مسار يصغّر، لا يُخزّن ملفات وسائط
-- طلابية — راجع "خطة إعادة تصميم مسار 2.0"). يعكس 20260823_student_photos_storage.sql:
-- يحذف سياسات المخزن، وينظّف حقلي photo/photoPath المتبقيَين من سجلات
-- الطلبة الحالية.
--
-- ملاحظة: Supabase يمنع الآن DELETE مباشر على storage.objects/storage.buckets
-- من SQL Editor (protect_delete trigger — "Use the Storage API instead")،
-- فحذف حاوية student-photos وكل الملفات بداخلها فعليًا لازم من لوحة
-- التحكم: Storage → اضغط الحاوية student-photos → ⋮ → Delete bucket
-- (يحذف الحاوية وكل ملفاتها معًا دفعة وحدة عبر Storage API). نفّذ هذا
-- الملف أولًا (يحذف السياسات وينظّف بيانات الطلبة)، ثم احذف الحاوية يدويًا.
begin;

drop policy if exists student_photos_read on storage.objects;
drop policy if exists student_photos_admin_insert on storage.objects;
drop policy if exists student_photos_admin_update on storage.objects;
drop policy if exists student_photos_admin_delete on storage.objects;

update public.students set data = data - 'photo' - 'photoPath'
where data ? 'photo' or data ? 'photoPath';

commit;

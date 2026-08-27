-- إزالة ميزة صور الطلبة بالكامل (قرار: مسار يصغّر، لا يُخزّن ملفات وسائط
-- طلابية — راجع "خطة إعادة تصميم مسار 2.0"). يعكس 20260823_student_photos_storage.sql:
-- يحذف كل كائنات المخزن، سياساته، والحاوية نفسها، وينظّف حقلي photo/photoPath
-- المتبقيَين من سجلات الطلبة الحالية.
begin;

delete from storage.objects where bucket_id = 'student-photos';

drop policy if exists student_photos_read on storage.objects;
drop policy if exists student_photos_admin_insert on storage.objects;
drop policy if exists student_photos_admin_update on storage.objects;
drop policy if exists student_photos_admin_delete on storage.objects;

delete from storage.buckets where id = 'student-photos';

update public.students set data = data - 'photo' - 'photoPath'
where data ? 'photo' or data ? 'photoPath';

commit;

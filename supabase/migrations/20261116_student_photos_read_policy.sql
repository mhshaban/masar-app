-- قراءة فقط لصور الطلبة في حاوية student-photos الخاصة، لنفس مستخدمي مسار
-- النشطين الذين يقرؤون جدول students (masar_is_active_user). لا رفع ولا حذف.
-- طُبّقت على مشروع GUIDE بتاريخ 2026-11-16 بموافقة رئيس القسم.
create policy student_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'student-photos' and public.masar_is_active_user());

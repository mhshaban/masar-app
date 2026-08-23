-- مخزن خاص لصور الطلبة. الصور غير عامة وتُعرض بروابط موقعة قصيرة العمر.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists student_photos_read on storage.objects;
create policy student_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'student-photos' and public.masar_is_active_user());

drop policy if exists student_photos_admin_insert on storage.objects;
create policy student_photos_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'student-photos' and public.masar_is_admin());

drop policy if exists student_photos_admin_update on storage.objects;
create policy student_photos_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'student-photos' and public.masar_is_admin())
  with check (bucket_id = 'student-photos' and public.masar_is_admin());

drop policy if exists student_photos_admin_delete on storage.objects;
create policy student_photos_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'student-photos' and public.masar_is_admin());

commit;

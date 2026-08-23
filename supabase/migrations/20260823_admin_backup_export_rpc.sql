-- تصدير النسخة الكاملة بطلب واحد، مع تحقق إدمن من طرف قاعدة البيانات.
begin;

create or replace function public.masar_export_backup()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not public.masar_is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'app', 'masar',
    'exportedAt', now(),
    'dbVersion', 5,
    'collections', jsonb_build_object(
      'departmentPlanProjects', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."departmentPlanProjects"),
      'agendaStatus', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."agendaStatus"),
      'actionProgress', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."actionProgress"),
      'followUpItems', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."followUpItems"),
      'reminders', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."reminders"),
      'students', (select coalesce(jsonb_agg((data - 'photo') || jsonb_build_object('id',id)), '[]'::jsonb) from public."students"),
      'grades', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."grades"),
      'termAverages', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."termAverages"),
      'guidanceCases', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."guidanceCases"),
      'caseSessions', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."caseSessions"),
      'supportPlans', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."supportPlans"),
      'supportPlanActions', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."supportPlanActions"),
      'careerSessions', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."careerSessions"),
      'importBatches', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."importBatches"),
      'promotedSubjects', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."promotedSubjects"),
      'promotedImportBatches', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."promotedImportBatches"),
      'teacherSchedule', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."teacherSchedule"),
      'officeHours', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."officeHours")
    )
  );
end;
$$;

revoke all on function public.masar_export_backup() from public;
grant execute on function public.masar_export_backup() to authenticated;

commit;

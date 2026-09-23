-- courseGrades: صفوف درجة خام (طالب × مقرر × فصل) من شيت "درجات المقررات"
-- بملف كشف الطلاب — تُكتب مع كل تشغيلة "تحديث المعدلات" (استبدال كامل، نفس
-- دلالة academicFlags/termAverages)، وتغذّي شاشتين كانتا تعتمدان على مسح
-- شهادات PDF حيًا من مجلد "مسار" المحلي: تدقيق قالب المقررات (اكتشاف رموز
-- مقررات غير مدرجة بالقالب)، وجدول "سجل المقررات" بملف الطالب. راجع README
-- قسم "استيراد الدرجات والشهادات".
--
-- shape المتوقع لعمود data بكل صف (id = "${studentId}--${term}--${subjectCode}"):
--   {
--     "studentId": "...", "term": "الفصل الدراسي الأول — المستوي الأول — العام الدراسي 2025/2026",
--     "subjectCode": "...", "subjectName": "...",
--     "score": 84.5, "scoreStatus": null, "notes": null, "sourceFile": "..."
--   }
--
-- تشغيل هذا الملف يدويًا عبر SQL Editor بلوحة تحكم مشروع Supabase الخاص
-- بمسار — رفعه لـ GitHub وحده لا يطبّقه.

begin;

create table if not exists public."courseGrades" (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public."courseGrades" enable row level security;

drop policy if exists "courseGrades_read" on public."courseGrades";
create policy "courseGrades_read" on public."courseGrades"
  for select using (public.masar_is_active_user());

drop policy if exists "courseGrades_write" on public."courseGrades";
create policy "courseGrades_write" on public."courseGrades"
  for all
  using (public.masar_current_role() = 'admin')
  with check (public.masar_current_role() = 'admin');

drop trigger if exists "courseGrades_touch_updated_at" on public."courseGrades";
create trigger "courseGrades_touch_updated_at"
  before update on public."courseGrades"
  for each row execute function public.masar_touch_updated_at();

create index if not exists course_grades_student_id_idx on public."courseGrades" ((data->>'studentId'));

grant select, insert, update, delete on public."courseGrades" to authenticated;

-- ── نفس دالتي النسخ الاحتياطي (20260917_attendance_sheets.sql) بإضافة
-- courseGrades فقط لمصفوفة المجموعات ──────────────────────────────────────

create or replace function public.masar_export_backup()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
begin
  if not public.masar_is_admin() then raise exception 'admin role required' using errcode = '42501'; end if;
  return jsonb_build_object('app','masar','exportedAt',now(),'dbVersion',5,'collections',jsonb_build_object(
    'departmentPlanProjects',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."departmentPlanProjects"),
    'agendaStatus',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."agendaStatus"),
    'actionProgress',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."actionProgress"),
    'followUpItems',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."followUpItems"),
    'reminders',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."reminders"),
    'students',(select coalesce(jsonb_agg((data - 'photo') || jsonb_build_object('id',id)),'[]'::jsonb) from public."students"),
    'academicFlags',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."academicFlags"),
    'termAverages',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."termAverages"),
    'courseGrades',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."courseGrades"),
    'guidanceCases',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."guidanceCases"),
    'caseSessions',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."caseSessions"),
    'supportPlans',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."supportPlans"),
    'supportPlanActions',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."supportPlanActions"),
    'careerSessions',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."careerSessions"),
    'promotedSubjects',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."promotedSubjects"),
    'promotedImportBatches',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."promotedImportBatches"),
    'departmentForms',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."departmentForms"),
    'schoolTeachers',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."schoolTeachers"),
    'attendanceSheets',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."attendanceSheets")
  ));
end;
$$;

revoke all on function public.masar_export_backup() from public;
grant execute on function public.masar_export_backup() to authenticated;

create or replace function public.masar_restore_backup(p_backup jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  collection text;
  rows jsonb;
  counts jsonb := '{}'::jsonb;
  row_count integer;
  collections text[] := array[
    'departmentPlanProjects', 'agendaStatus', 'actionProgress', 'followUpItems',
    'reminders', 'students', 'academicFlags', 'termAverages', 'courseGrades', 'guidanceCases',
    'caseSessions', 'supportPlans', 'supportPlanActions', 'careerSessions',
    'promotedSubjects', 'promotedImportBatches', 'departmentForms',
    'schoolTeachers', 'attendanceSheets'
  ];
begin
  if not public.masar_is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  if p_backup is null
     or jsonb_typeof(p_backup) <> 'object'
     or p_backup->>'app' <> 'masar'
     or jsonb_typeof(p_backup->'collections') <> 'object' then
    raise exception 'invalid masar backup' using errcode = '22023';
  end if;

  foreach collection in array collections loop
    rows := p_backup->'collections'->collection;
    if rows is null or jsonb_typeof(rows) <> 'array' then
      raise exception 'missing or invalid collection: %', collection using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(rows) as elements(item)
      where jsonb_typeof(item) <> 'object'
         or nullif(btrim(item->>'id'), '') is null
    ) then
      raise exception 'invalid record id in collection: %', collection using errcode = '22023';
    end if;
    if (
      select count(*) <> count(distinct item->>'id')
      from jsonb_array_elements(rows) as elements(item)
    ) then
      raise exception 'duplicate record id in collection: %', collection using errcode = '22023';
    end if;
  end loop;

  perform set_config('masar.backup_restore', '1', true);
  foreach collection in array collections loop
    rows := p_backup->'collections'->collection;
    execute format('delete from public.%I', collection);
    execute format(
      'insert into public.%I (id, data) select item->>''id'', item from jsonb_array_elements($1) as elements(item)',
      collection
    ) using rows;
    row_count := jsonb_array_length(rows);
    counts := counts || jsonb_build_object(collection, row_count);
  end loop;

  insert into public.audit_logs (actor, action, table_name, record_id, after_data)
  values (
    coalesce(auth.email(), auth.uid()::text),
    'restore_backup',
    null,
    null,
    jsonb_build_object('counts', counts, 'sourceExportedAt', p_backup->>'exportedAt')
  );

  return counts;
end;
$$;

revoke all on function public.masar_restore_backup(jsonb) from public;
grant execute on function public.masar_restore_backup(jsonb) to authenticated;

commit;

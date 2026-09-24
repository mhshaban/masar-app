-- نُفّذ فعليًا عبر mcp__Supabase__apply_migration على مشروع wtbtgubycnmsytfythhb
-- (GUIDE) — هذا الملف نسخة موثَّقة بالمستودع، شغّله يدويًا بـSQL Editor لو
-- أُعيد بناء المشروع من الصفر.
--
-- نسخة احتياطية تلقائية أسبوعية (طلب صريح من المرشد بعد عطل النسخة اليدوية
-- بتاريخ اليوم بسبب statement_timeout — راجع migration اليوم السابقة).
-- تُخزَّن داخل قاعدة البيانات نفسها (جدول عادي لا Storage) بنفس شكل
-- masar_export_backup تمامًا، فيمكن تنزيلها أو استعادتها مباشرة بنفس منطق
-- النسخة اليدوية القائم. الاحتفاظ بآخر 4 نسخ فقط (تقريبًا شهر بمعدل أسبوعي)
-- لتبقى ضمن حدود قاعدة بيانات الخطة المجانية (500 ميجا) — كل نسخة ~23 ميجا
-- حاليًا وتكبر مع نمو courseGrades.

create table if not exists public.backup_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  payload jsonb not null
);

alter table public.backup_snapshots enable row level security;

-- نفس حد صلاحية النسخة اليدوية (masar_export_backup): الإدمن فقط. لا سياسة
-- كتابة لأي دور — الكتابة الوحيدة من masar_run_scheduled_backup أدناه
-- (SECURITY DEFINER، يعمل كـpostgres عبر pg_cron فقط، لا PostgREST).
create policy "backup_snapshots_admin_read" on public.backup_snapshots
  for select using (public.masar_is_admin());

-- تُبنى النسخة بنفس استعلام masar_export_backup بالضبط (بلا فحص admin هنا —
-- pg_cron لا يحمل سياق JWT/طلب أصلًا؛ الأمان من كون الدالة SECURITY DEFINER
-- ولا تُمنح لأي دور PostgREST، فلا طريق لاستدعائها إلا من الجدولة الداخلية).
create or replace function public.masar_run_scheduled_backup()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  snap jsonb;
begin
  select jsonb_build_object('app','masar','exportedAt',now(),'dbVersion',5,'collections',jsonb_build_object(
    'departmentPlanProjects',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."departmentPlanProjects"),
    'agendaStatus',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."agendaStatus"),
    'actionProgress',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."actionProgress"),
    'followUpItems',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."followUpItems"),
    'reminders',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."reminders"),
    'students',(select coalesce(jsonb_agg((data - 'photo') || jsonb_build_object('id',id)),'[]'::jsonb) from public."students"),
    'academicFlags',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."academicFlags"),
    'termAverages',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."termAverages"),
    'courseGrades',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."courseGrades"),
    'classSchedules',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."classSchedules"),
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
  )) into snap;

  insert into public.backup_snapshots (payload) values (snap);

  delete from public.backup_snapshots
  where id not in (
    select id from public.backup_snapshots order by created_at desc limit 4
  );
end;
$$;

revoke all on function public.masar_run_scheduled_backup() from public;

-- قائمة النسخ التلقائية بلا سحب المحتوى الكامل (لعرضها بشاشة النسخ
-- الاحتياطي) — SECURITY INVOKER عادية، الحماية من سياسة القراءة أعلاه.
create or replace function public.masar_list_backup_snapshots()
returns table(id uuid, created_at timestamptz, size_bytes integer)
language sql
stable
security invoker
set search_path = public
as $$
  select id, created_at, octet_length(payload::text) as size_bytes
  from public.backup_snapshots
  order by created_at desc;
$$;

revoke all on function public.masar_list_backup_snapshots() from public;
grant execute on function public.masar_list_backup_snapshots() to authenticated;

-- محتوى نسخة تلقائية واحدة كاملًا، للتنزيل/الاستعادة — نفس شكل
-- masar_export_backup تمامًا فيعمل مع نفس منطق العميل (parseBackupFile/
-- restoreBackup) بلا أي تمييز.
create or replace function public.masar_get_backup_snapshot(p_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select payload from public.backup_snapshots where id = p_id;
$$;

revoke all on function public.masar_get_backup_snapshot(uuid) from public;
grant execute on function public.masar_get_backup_snapshot(uuid) to authenticated;

create extension if not exists pg_cron;

select cron.schedule(
  'masar-weekly-backup',
  '0 23 * * 4', -- الخميس 23:00 UTC = الجمعة 02:00 بتوقيت البحرين (UTC+3)، وقت هادئ
  $$select public.masar_run_scheduled_backup();$$
);

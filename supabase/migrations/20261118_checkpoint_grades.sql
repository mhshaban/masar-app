-- checkpointGrades: درجات الوقفات التقويمية (وقفتان بكل فصل) — سجل واحد لكل
-- طالب لكل وقفة لكل فصل. id = "cp-<الفصل>-<رقم الوقفة>-<الرقم الأكاديمي>".
--   {
--     "studentId": "...", "studentName": "...", "level": "...", "section": "...",
--     "checkpoint": 1, "term": "الفصل الأول 2026-2027",
--     "subjects": [{ "code": "...", "name": "...", "score": 17, "maxScore": 20, "pct": 85, "status": null }],
--     "averagePct": 78.5, "sourceFile": "...", "importedAt": "...", "reportSentAt": "..."
--   }
-- القراءة لكل مستخدم نشط، والكتابة للإدمن والمرشدين (الاستيراد + تسجيل
-- وقت إرسال التقرير للطالب).

begin;

create table if not exists public."checkpointGrades" (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public."checkpointGrades" enable row level security;

drop policy if exists "checkpointGrades_read" on public."checkpointGrades";
drop policy if exists "checkpointGrades_write" on public."checkpointGrades";
create policy "checkpointGrades_read" on public."checkpointGrades" for select using (public.masar_is_active_user());
create policy "checkpointGrades_write" on public."checkpointGrades" for all
  using (public.masar_current_role() in ('admin','counselor'))
  with check (public.masar_current_role() in ('admin','counselor'));
grant select, insert, update, delete on public."checkpointGrades" to authenticated;

drop trigger if exists "checkpointGrades_touch_updated_at" on public."checkpointGrades";
create trigger "checkpointGrades_touch_updated_at" before update on public."checkpointGrades"
  for each row execute function public.masar_touch_updated_at();

create index if not exists checkpoint_grades_student_id_idx on public."checkpointGrades" ((data->>'studentId'));

-- أحداث التدقيق الجديدة: استيراد درجات وقفة، وتجهيز تقرير الطالب للإرسال.
create or replace function public.masar_log_app_event(
  p_action text,
  p_table_name text default null,
  p_record_id text default null,
  p_count integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  allowed_actions constant text[] := array[
    'export_backup', 'export_word', 'export_excel',
    'import_students', 'import_teachers', 'import_promoted', 'import_department_plan',
    'import_curriculum_template', 'import_academic_averages',
    'import_checkpoint_grades', 'checkpoint_report_email',
    'update_student', 'update_teacher'
  ];
begin
  if public.masar_current_role() is null then
    raise exception 'active user required' using errcode = '42501';
  end if;
  if not (p_action = any(allowed_actions)) then
    raise exception 'unsupported audit event' using errcode = '22023';
  end if;
  insert into public.audit_logs(actor, action, table_name, record_id, after_data)
  values (
    coalesce(auth.jwt()->>'email', auth.uid()::text),
    p_action,
    nullif(left(coalesce(p_table_name, ''), 80), ''),
    nullif(left(coalesce(p_record_id, ''), 160), ''),
    case when p_count is null then null else jsonb_build_object('count', greatest(p_count, 0)) end
  );
end;
$body$;

revoke all on function public.masar_log_app_event(text, text, text, integer) from public;
grant execute on function public.masar_log_app_event(text, text, text, integer) to authenticated;

commit;

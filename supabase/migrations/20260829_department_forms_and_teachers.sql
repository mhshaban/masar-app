begin;

do $$
declare
  collection text;
  read_policy text;
  write_policy text;
  trigger_name text;
begin
  foreach collection in array array['departmentForms', 'schoolTeachers'] loop
    execute format($f$
      create table if not exists public.%I (
        id text primary key,
        data jsonb not null,
        updated_at timestamptz not null default now()
      )
    $f$, collection);
    execute format('alter table public.%I enable row level security', collection);
    read_policy := collection || '_read'; write_policy := collection || '_write'; trigger_name := collection || '_touch_updated_at';
    execute format('drop policy if exists %I on public.%I', read_policy, collection);
    execute format('drop policy if exists %I on public.%I', write_policy, collection);
    execute format('create policy %I on public.%I for select using (public.masar_is_active_user())', read_policy, collection);
    execute format('create policy %I on public.%I for all using (public.masar_current_role() in (''admin'',''counselor'')) with check (public.masar_current_role() in (''admin'',''counselor''))', write_policy, collection);
    execute format('grant select, insert, update, delete on public.%I to authenticated', collection);
    execute format('drop trigger if exists %I on public.%I', trigger_name, collection);
    execute format('create trigger %I before update on public.%I for each row execute function public.masar_touch_updated_at()', trigger_name, collection);
  end loop;
end $$;

create index if not exists department_forms_student_idx on public."departmentForms" ((data->>'studentId'));
create index if not exists department_forms_status_idx on public."departmentForms" ((data->>'status'));

drop trigger if exists "departmentForms_audit" on public."departmentForms";
create trigger "departmentForms_audit" after insert or update or delete on public."departmentForms"
for each row execute function public.masar_audit_sensitive_change();

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
    'guidanceCases',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."guidanceCases"),
    'caseSessions',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."caseSessions"),
    'supportPlans',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."supportPlans"),
    'supportPlanActions',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."supportPlanActions"),
    'careerSessions',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."careerSessions"),
    'promotedSubjects',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."promotedSubjects"),
    'promotedImportBatches',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."promotedImportBatches"),
    'departmentForms',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."departmentForms"),
    'schoolTeachers',(select coalesce(jsonb_agg(data || jsonb_build_object('id',id)),'[]'::jsonb) from public."schoolTeachers")
  ));
end;
$$;

revoke all on function public.masar_export_backup() from public;
grant execute on function public.masar_export_backup() to authenticated;

commit;

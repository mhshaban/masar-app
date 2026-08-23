-- مسار: أدوار فعلية + سياسات RLS + سجل تدقيق للعمليات الحساسة.
-- يُطبّق يدويًا بعد migrations السابقة. لا يغيّر أي بيانات أعمال.

begin;

alter table public.profiles
  add column if not exists role text not null default 'counselor';

update public.profiles
set role = case when is_admin then 'admin' else coalesce(nullif(role, ''), 'counselor') end;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'counselor', 'read_only'));

create or replace function public.masar_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not coalesce(p.is_active, false) then null
    when coalesce(p.is_admin, false) or p.role = 'admin' then 'admin'
    else p.role
  end
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.masar_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.masar_current_role() = 'admin'; $$;

revoke all on function public.masar_current_role() from public;
grant execute on function public.masar_current_role() to authenticated;
grant execute on function public.masar_is_admin() to authenticated;

-- مزامنة العمود التاريخي is_admin مع role لمنع اختلاف المصدرين.
create or replace function public.masar_sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    new.is_admin := new.role = 'admin';
  elsif tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin then
    new.role := case when new.is_admin then 'admin' else 'counselor' end;
  else
    new.role := case when new.is_admin or new.role = 'admin' then 'admin' else new.role end;
    new.is_admin := new.role = 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists masar_profiles_sync_role on public.profiles;
create trigger masar_profiles_sync_role
  before insert or update of role, is_admin on public.profiles
  for each row execute function public.masar_sync_profile_role();

do $$
declare
  collection text;
  old_policy text;
  read_policy text;
  write_policy text;
  all_collections text[] := array[
    'departmentPlanProjects', 'agendaStatus', 'actionProgress', 'followUpItems',
    'reminders', 'students', 'grades', 'termAverages', 'guidanceCases',
    'caseSessions', 'supportPlans', 'supportPlanActions', 'careerSessions',
    'importBatches', 'promotedSubjects', 'promotedImportBatches',
    'teacherSchedule', 'officeHours'
  ];
  counselor_write text[] := array[
    'actionProgress', 'reminders', 'guidanceCases', 'caseSessions',
    'supportPlans', 'supportPlanActions', 'careerSessions'
  ];
begin
  foreach collection in array all_collections loop
    old_policy := collection || '_rw';
    read_policy := collection || '_read';
    write_policy := collection || '_write';

    execute format('drop policy if exists %I on public.%I', old_policy, collection);
    execute format('drop policy if exists %I on public.%I', read_policy, collection);
    execute format('drop policy if exists %I on public.%I', write_policy, collection);

    execute format(
      'create policy %I on public.%I for select using (public.masar_is_active_user())',
      read_policy, collection
    );

    if collection = any(counselor_write) then
      execute format(
        'create policy %I on public.%I for all using (public.masar_current_role() in (''admin'',''counselor'')) with check (public.masar_current_role() in (''admin'',''counselor''))',
        write_policy, collection
      );
    else
      execute format(
        'create policy %I on public.%I for all using (public.masar_current_role() = ''admin'') with check (public.masar_current_role() = ''admin'')',
        write_policy, collection
      );
    end if;
  end loop;
end $$;

-- فهارس تعبيرية للاستعلامات الأكثر تكرارًا داخل JSONB.
create index if not exists grades_student_id_idx on public."grades" ((data->>'studentId'));
create index if not exists term_averages_student_id_idx on public."termAverages" ((data->>'studentId'));
create index if not exists guidance_cases_student_status_idx on public."guidanceCases" ((data->>'studentId'), (data->>'status'));
create index if not exists case_sessions_case_id_idx on public."caseSessions" ((data->>'caseId'));
create index if not exists support_plans_student_status_idx on public."supportPlans" ((data->>'studentId'), (data->>'status'));
create index if not exists support_actions_plan_due_idx on public."supportPlanActions" ((data->>'planId'), (data->>'dueDate'));
create index if not exists career_sessions_student_id_idx on public."careerSessions" ((data->>'studentId'));
create index if not exists promoted_subjects_student_id_idx on public."promotedSubjects" ((data->>'studentId'));

create or replace function public.masar_audit_sensitive_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_id text;
begin
  changed_id := case when tg_op = 'DELETE' then old.id else new.id end;
  insert into public.audit_logs(actor, action, table_name, record_id)
  values (
    coalesce(auth.jwt()->>'email', auth.uid()::text),
    lower(tg_op),
    tg_table_name,
    changed_id
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- الاستعادة أخطر من أن تكون متاحة لمجرد حساب نشط؛ تُبقي الكتابة في سجل
-- التدقيق خلف نفس تحقق الإدمن الذي يحمي جداول الاستيراد والنسخ الاحتياطي.
create or replace function public.masar_log_backup_restore(p_summary jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.masar_is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  insert into public.audit_logs (actor, action, table_name, record_id, after_data)
  values (coalesce(auth.email(), auth.uid()::text), 'restore_backup', null, null, p_summary);
end;
$$;

do $$
declare
  collection text;
  trigger_name text;
  audited text[] := array[
    'departmentPlanProjects', 'actionProgress', 'guidanceCases', 'caseSessions',
    'supportPlans', 'supportPlanActions', 'careerSessions'
  ];
begin
  foreach collection in array audited loop
    trigger_name := collection || '_audit';
    execute format('drop trigger if exists %I on public.%I', trigger_name, collection);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.masar_audit_sensitive_change()',
      trigger_name, collection
    );
  end loop;
end $$;

commit;

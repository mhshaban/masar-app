-- سجل تدقيق مخفف: يسجل هوية المنفذ ونوع العملية والسجل فقط، دون نسخ
-- الصور أو المرفقات أو كامل JSON، لتجنب تضخم قاعدة البيانات وEgress.
begin;

create or replace function public.masar_audit_core_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := coalesce(new.id, old.id);
begin
  insert into public.audit_logs(actor, action, table_name, record_id)
  values (auth.uid()::text, lower(tg_op), tg_table_name, v_id);
  return coalesce(new, old);
end;
$$;

do $$
declare
  collection text;
  trigger_name text;
  collections text[] := array[
    'departmentPlanProjects', 'actionProgress', 'reminders',
    'guidanceCases', 'caseSessions', 'supportPlans', 'supportPlanActions',
    'careerSessions', 'promotedImportBatches', 'departmentForms'
  ];
begin
  foreach collection in array collections loop
    trigger_name := collection || '_audit';
    execute format('drop trigger if exists %I on public.%I', trigger_name, collection);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.masar_audit_core_change()',
      trigger_name, collection
    );
  end loop;
end $$;

commit;

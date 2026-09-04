-- مسار: استعادة النسخة الاحتياطية داخل معاملة PostgreSQL واحدة.
-- أي خطأ في أي مجموعة يلغي كل الحذف والإدخال، فلا تبقى قاعدة البيانات
-- نصف مستعادة. التنفيذ محصور بحساب الإدمن، مع سجل تدقيق واحد للعملية.

begin;

create or replace function public.masar_audit_sensitive_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_id text;
begin
  -- الاستعادة تسجل عملية واحدة شاملة في نهايتها بدل آلاف السجلات الصفية.
  if current_setting('masar.backup_restore', true) = '1' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

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
    'reminders', 'students', 'academicFlags', 'termAverages', 'guidanceCases',
    'caseSessions', 'supportPlans', 'supportPlanActions', 'careerSessions',
    'promotedSubjects', 'promotedImportBatches', 'departmentForms',
    'schoolTeachers'
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

  -- نتحقق من كل شيء أولًا، قبل حذف أي صف.
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

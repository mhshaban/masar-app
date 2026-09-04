-- مسار: سجل عمليات مركزي خفيف، بقراءة مرشّحة من الخادم للإدمن فقط.
-- لا تُنسخ بيانات الطلاب أو الصور أو المرفقات إلى السجل.

begin;

create index if not exists audit_logs_ts_desc_idx on public.audit_logs (ts desc, id desc);
create index if not exists audit_logs_action_ts_idx on public.audit_logs (action, ts desc);
create index if not exists audit_logs_table_ts_idx on public.audit_logs (table_name, ts desc);

create or replace function public.masar_audit_core_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  if current_setting('masar.backup_restore', true) = '1' then
    return coalesce(new, old);
  end if;
  v_id := case when tg_op = 'DELETE' then old.id else new.id end;
  insert into public.audit_logs(actor, action, table_name, record_id)
  values (coalesce(auth.jwt()->>'email', auth.uid()::text), lower(tg_op), tg_table_name, v_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

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
as $$
declare
  allowed_actions constant text[] := array[
    'export_backup', 'export_word', 'export_excel',
    'import_students', 'import_teachers', 'import_promoted',
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
$$;

revoke all on function public.masar_log_app_event(text, text, text, integer) from public;
grant execute on function public.masar_log_app_event(text, text, text, integer) to authenticated;

create or replace function public.masar_list_audit_logs(
  p_limit integer default 25,
  p_offset integer default 0,
  p_action text default null,
  p_table_name text default null,
  p_actor text default null,
  p_record_id text default null,
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_rows jsonb;
begin
  if not public.masar_is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  select count(*) into v_total
  from public.audit_logs log
  where (p_action is null or log.action = p_action)
    and (p_table_name is null or log.table_name = p_table_name)
    and (p_actor is null or coalesce(log.actor, '') ilike '%' || p_actor || '%')
    and (p_record_id is null or coalesce(log.record_id, '') ilike '%' || p_record_id || '%')
    and (p_from is null or log.ts >= p_from::timestamptz)
    and (p_to is null or log.ts < (p_to + 1)::timestamptz);

  select coalesce(jsonb_agg(to_jsonb(page_rows) order by page_rows.ts desc, page_rows.id desc), '[]'::jsonb)
  into v_rows
  from (
    select log.id, log.ts, log.actor, log.action, log.table_name, log.record_id,
      case when jsonb_typeof(log.after_data->'count') = 'number' then (log.after_data->>'count')::integer else null end as row_count
    from public.audit_logs log
    where (p_action is null or log.action = p_action)
      and (p_table_name is null or log.table_name = p_table_name)
      and (p_actor is null or coalesce(log.actor, '') ilike '%' || p_actor || '%')
      and (p_record_id is null or coalesce(log.record_id, '') ilike '%' || p_record_id || '%')
      and (p_from is null or log.ts >= p_from::timestamptz)
      and (p_to is null or log.ts < (p_to + 1)::timestamptz)
    order by log.ts desc, log.id desc
    limit v_limit offset v_offset
  ) page_rows;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

revoke all on function public.masar_list_audit_logs(integer, integer, text, text, text, text, date, date) from public;
grant execute on function public.masar_list_audit_logs(integer, integer, text, text, text, text, date, date) to authenticated;

commit;

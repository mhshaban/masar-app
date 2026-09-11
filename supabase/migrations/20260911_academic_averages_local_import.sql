-- تحديث معدلات الطلبة (academicFlags/termAverages) صار متاحًا من داخل
-- التطبيق نفسه أيضًا (بجانب سكربت scripts/cowork-analyze-grades.mjs
-- المنفصل) — المرشد يمسح مجلد "مسار" المحلي من المتصفح مباشرة (pdf.js
-- المُضمَّن أصلًا بالتطبيق)، بلا حاجة لـNode.js/Terminal على جهاز منفصل.
-- نفس الجدولين المستهدفين، نفس دلالة الاستبدال الكامل — فقط إضافة اسم
-- حدث جديد لمسجّل العمليات.

begin;

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

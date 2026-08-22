-- مسار — تسجيل عمليات استعادة النسخة الاحتياطية بجدول audit_logs.
--
-- audit_logs (من 20260804_masar_core_schema.sql) لا سياسة INSERT له لأي
-- حساب عادي (فقط service_role عبر Edge Function admin-users يكتب فيه
-- مباشرة) — مقصود، حتى ما يقدر أي حساب يزوّر أو يحذف سجل تدقيق. لكن
-- استعادة النسخة الاحتياطية عملية طرف-عميل بالكامل (src/services/
-- backup-service.js، لا تمر بـ Edge Function)، فتبقى بلا تسجيل رغم إنها
-- من أخطر العمليات بالتطبيق (تستبدل بيانات كل المرشدين).
--
-- الحل: دالة RPC واحدة ضيّقة الصلاحية بدل فتح INSERT العام على audit_logs
-- (اللي كان يسمح لأي حساب نشط يزوّر actor بأي اسم أو يفبرك سجلات بلا
-- علاقة بعملية حقيقية). الدالة تحدّد actor من الجلسة نفسها (auth.email())
-- لا من مدخلات العميل، وتتحقق إن الحساب نشط فعلًا قبل الكتابة.

begin;

create or replace function public.masar_log_backup_restore(p_summary jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.masar_is_active_user() then
    raise exception 'inactive account';
  end if;
  insert into public.audit_logs (actor, action, table_name, record_id, after_data)
  values (coalesce(auth.email(), auth.uid()::text), 'restore_backup', null, null, p_summary);
end;
$$;

revoke all on function public.masar_log_backup_restore(jsonb) from public;
grant execute on function public.masar_log_backup_restore(jsonb) to authenticated;

commit;

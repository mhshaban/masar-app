-- نقل استيراد الدرجات والشهادات (Excel + PDF) من مسار إلى Cowork —
-- التحليل يصير كاملًا خارج التطبيق (Cowork يقرأ ملفات OneDrive المزامَنة
-- محليًا مباشرة)، ومسار يتوقف عن تخزين أي صف درجة فردي (طالب × مقرر ×
-- فصل). راجع README لتفاصيل التصميم الكامل والعقد بين الطرفين.
--
-- academicFlags: مجموعة جديدة، صف واحد لكل طالب فقط — معدل عام + معدل لكل
-- مقرر (اسم موحّد، لا رمز)، بلا أي درجة فردية. يكتبها Cowork بالكامل
-- (استبدال دفعة واحدة، لا تراكم تدريجي) بعد كل تحليل، بنفس حساب Supabase
-- Auth الحقيقي المستخدَم بالتطبيق (لازم يكون حساب إدمن — نفس صلاحية
-- استيراد الدرجات القديمة). مسار يبقى صاحب القرار الوحيد بحد الترشيح
-- (50٪) وتصنيف الشرائح (grade-flags-service.js/achievement-service.js) —
-- يقرأ فقط أرقامًا مجمَّعة جاهزة، لا يعيد حساب أي شيء من صفوف خام، وتغيير
-- الحد مستقبلًا يبقى تعديلًا بمكان واحد بكود مسار نفسه.
--
-- shape المتوقع لعمود data بكل صف (id = studentId):
--   {
--     "studentId": "...",
--     "overallPct": 87,                                   -- أو null إن لم يُحسب
--     "subjects": [ { "subject": "الرياضيات", "pct": 63 }, ... ],
--     "absentCount": 0,
--     "barredCount": 0,
--     "computedAt": "2026-...T...Z"
--   }
--
-- يعكس أيضًا فجوة سابقة: إزالة الجدول الدراسي/الساعات المكتبية من الكود
-- (راجع commit سابق) لم تُسقِط جدولَي teacherSchedule/officeHours فعليًا
-- من قاعدة البيانات — يُستكمَل ذلك هنا.
--
-- تشغيل هذا الملف يدويًا عبر SQL Editor بلوحة تحكم مشروع Supabase الخاص
-- بمسار — رفعه لـ GitHub وحده لا يطبّقه.

begin;

-- ── academicFlags: مجموعة عامة جديدة بنفس نمط بقية المجموعات ────────────

create table if not exists public."academicFlags" (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public."academicFlags" enable row level security;

drop policy if exists "academicFlags_read" on public."academicFlags";
create policy "academicFlags_read" on public."academicFlags"
  for select using (public.masar_is_active_user());

drop policy if exists "academicFlags_write" on public."academicFlags";
create policy "academicFlags_write" on public."academicFlags"
  for all
  using (public.masar_current_role() = 'admin')
  with check (public.masar_current_role() = 'admin');

drop trigger if exists "academicFlags_touch_updated_at" on public."academicFlags";
create trigger "academicFlags_touch_updated_at"
  before update on public."academicFlags"
  for each row execute function public.masar_touch_updated_at();

create index if not exists academic_flags_student_id_idx on public."academicFlags" ((data->>'studentId'));

grant select, insert, update, delete on public."academicFlags" to authenticated;

-- ── تقاعد دوال الحساب على الجداول الخام قبل حذفها ────────────────────────
-- (لغة SQL تُسجّل اعتمادًا فعليًا على الجداول التي تستعلم عنها، فلازم تُحذف
-- الدوال أولًا قبل حذف الجداول تحتها.)

drop function if exists public.masar_dashboard_snapshot(integer);
drop function if exists public.masar_grade_summaries(numeric);

-- ── حذف الجداول الخام اللي انتقل مصدرها لـ Cowork/توقّفت الميزة كليًا ────

drop table if exists public."grades" cascade;
drop table if exists public."importBatches" cascade;
drop table if exists public."teacherSchedule" cascade;
drop table if exists public."officeHours" cascade;

-- ── تحديث تصدير النسخة الاحتياطية: إسقاط المجموعات المحذوفة، إضافة الجديدة ──

create or replace function public.masar_export_backup()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not public.masar_is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'app', 'masar',
    'exportedAt', now(),
    'dbVersion', 5,
    'collections', jsonb_build_object(
      'departmentPlanProjects', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."departmentPlanProjects"),
      'agendaStatus', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."agendaStatus"),
      'actionProgress', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."actionProgress"),
      'followUpItems', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."followUpItems"),
      'reminders', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."reminders"),
      'students', (select coalesce(jsonb_agg((data - 'photo') || jsonb_build_object('id',id)), '[]'::jsonb) from public."students"),
      'academicFlags', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."academicFlags"),
      'termAverages', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."termAverages"),
      'guidanceCases', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."guidanceCases"),
      'caseSessions', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."caseSessions"),
      'supportPlans', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."supportPlans"),
      'supportPlanActions', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."supportPlanActions"),
      'careerSessions', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."careerSessions"),
      'promotedSubjects', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."promotedSubjects"),
      'promotedImportBatches', (select coalesce(jsonb_agg(data || jsonb_build_object('id',id)), '[]'::jsonb) from public."promotedImportBatches")
    )
  );
end;
$$;

revoke all on function public.masar_export_backup() from public;
grant execute on function public.masar_export_backup() to authenticated;

commit;

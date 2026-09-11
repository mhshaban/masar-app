-- مسار: جدول قالب المقررات (curriculumTemplates) — كان قبل الآن ملف JS ثابت
-- (curriculum-template.js) يحتاج تعديل يدوي بالكود كل مرة يتحدث ملف
-- "المقررات.xlsx". صار الآن مجموعة سحابية عادية (نفس نمط id+data jsonb لكل
-- المجموعات الأخرى)، ويُحدَّث تلقائيًا من شيتي "الصناعي" و"التجاري" لو
-- أُضيفا لملف كشف المدرسة الشامل، عبر تبويب "تحديث شامل" بالاستيراد —
-- بدل ما يحتاج المستخدم يطلب تحديث الكود كل مرة.
--
-- صف واحد لكل مسار (id = "الصناعي" أو "التجاري")، data = { departments: [
-- {department, type, codes: [الفصل١..الفصل٦]} ] }. مصدر الحقيقة الابتدائي
-- هنا هو نفس بيانات curriculum-template.js الحالية (قبل حذفه) — حتى لا
-- تنقطع شاشة شهادة الطالب فور تطبيق هذا الـmigration وقبل أول "تحديث شامل"
-- يتضمن شيتي المقررات.

begin;

create table if not exists public."curriculumTemplates" (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public."curriculumTemplates" enable row level security;

drop policy if exists "curriculumTemplates_read" on public."curriculumTemplates";
drop policy if exists "curriculumTemplates_write" on public."curriculumTemplates";
create policy "curriculumTemplates_read" on public."curriculumTemplates"
  for select using (public.masar_is_active_user());
create policy "curriculumTemplates_write" on public."curriculumTemplates"
  for all using (public.masar_current_role() in ('admin','counselor'))
  with check (public.masar_current_role() in ('admin','counselor'));

grant select, insert, update, delete on public."curriculumTemplates" to authenticated;

drop trigger if exists "curriculumTemplates_touch_updated_at" on public."curriculumTemplates";
create trigger "curriculumTemplates_touch_updated_at"
  before update on public."curriculumTemplates"
  for each row execute function public.masar_touch_updated_at();

insert into public."curriculumTemplates" (id, data) values ('الصناعي', $json${"departments":[{"department":"الإلكترونيات","type":"تخصصية","codes":["الك801","الك801","الك811","الك804","الك805","الك806"]},{"department":"الكهرباء","type":"تخصصية","codes":["كهر801","كهر801","ماك803","تمك803","كهر805","ماك805"]},{"department":"تقنيات وصيانة الحاسوب","type":"تخصصية","codes":["حاس801","حاس801","حاس807","حاس804","حاس805","حاس806"]},{"department":"التبريد والتكييف","type":"تخصصية","codes":["تبر807","تبر807","تبر803","تبر804","تبر805","تبر806"]},{"department":"التشغيل المكني","type":"تخصصية","codes":["تشغ807","تشغ807","تشغ803","تشغ804","تشغ805","تشغ806"]},{"department":"السيارات","type":"تخصصية","codes":["سار801","سار801","سار803","سار804","سار805","سار806"]},{"department":"اللحام والفبركة","type":"تخصصية","codes":["لحم801","لحم801","لحم803","لحم804","لحم805","لحم806"]},{"department":"الميكاترونكس","type":"تخصصية","codes":["","","مكا803","مكا804","مكا805","مكا806"]},{"department":"محركات الديزل","type":"تخصصية","codes":["","","ديز803","ديز804","ديز805","ديز806"]},{"department":"الرسم التقني","type":"تخصصية","codes":["رسم801","رسم802","رسم803/رسم813","رسم804/رسم814","رسم815","رسم816"]},{"department":"الاجتماعيات","type":"ثقافة عامة","codes":["وطن801","وطن802","وطن809","وطن810","وطن815","وطن816"]},{"department":"التربية الإسلامية","type":"ثقافة عامة","codes":["","دين808","","دين810","دين805",""]},{"department":"التربية البدنية","type":"ثقافة عامة","codes":["بدن801","بدن802","","بدن810","بدن805","بدن806"]},{"department":"الرياضيات","type":"ثقافة عامة","codes":["ريض813","ريض814","ريض807","ريض808","ريض811","ريض809"]},{"department":"العلوم","type":"ثقافة عامة","codes":["","كيم802","كيم803","فيز804","فيز805","فيز806"]},{"department":"اللغة الإنجليزية - القراءة الشاملة","type":"ثقافة عامة","codes":["","","انج883","انج884","انج885","انج886"]},{"department":"اللغة الإنجليزية - المهارات الاكاديمية","type":"ثقافة عامة","codes":["انج811","انج812","","","انج817","انج820"]},{"department":"اللغة الإنجليزية العامة","type":"ثقافة عامة","codes":["انج801","انج802","انج807","انج808","انج809","انج810"]},{"department":"اللغة العربية","type":"ثقافة عامة","codes":["عرب801","عرب802","عرب803","عرب804","عرب805","عرب806"]},{"department":"الارشاد والتوجيه والتنمية الشخصية","type":"مساندة","codes":["رشد801","رشد802","رشد803","رشد804","رشد815","درب841"]},{"department":"المشروعات الصغيرة وريادة الأعمال","type":"مساندة","codes":["","","","","مشر805","مشر808"]},{"department":"العمل مع الآخرين","type":"مساندة","codes":["","","","","اخر881",""]},{"department":"الحاسب الآلي","type":"مساندة","codes":["تقن801/تقن804","تقن802/تقن805","تقن881","تقن882/تقن884","",""]},{"department":"الميكانيكا التطبيقية","type":"مساندة","codes":["","","ميك803","ميك804","ميك805","ميك806"]},{"department":"الثقافة المرورية","type":"مساندة","codes":["","","","","","سيق881"]}]}$json$::jsonb) on conflict (id) do update set data = excluded.data;
insert into public."curriculumTemplates" (id, data) values ('التجاري', $json${"departments":[{"department":"البيع بالتجزئة واللوجستيات","type":"تخصصية","codes":["بيع801","","","","",""]},{"department":"الخدمات المالية","type":"تخصصية","codes":["محك801","محك801","محك813","محك804","محك805","محك806"]},{"department":"الدراسات التجارية","type":"تخصصية","codes":["تجر801","تجر801","تجر813","تجر804","تجر805","تجر806"]},{"department":"الوسائط المتعددة","type":"تخصصية","codes":["وسط801","وسط801","وسط813","وسط804","وسط805","وسط806"]},{"department":"مقدمة في البنوك والعمليات المصرفية","type":"تخصصية","codes":["","","","بنك804","",""]},{"department":"الاجتماعيات","type":"ثقافة عامة","codes":["وطن801","وطن802","وطن809","وطن810","وطن815","وطن816"]},{"department":"التربية الإسلامية","type":"ثقافة عامة","codes":["دين801","دين808","دين803","دين810","دين805","دين812"]},{"department":"التربية البدنية","type":"ثقافة عامة","codes":["بدن801","بدن802","بدن803","بدن810","بدن805","بدن806"]},{"department":"الرياضيات","type":"ثقافة عامة","codes":["ريض813","ريض814","ريض807","ريض808","ريض811","ريض809/ريض352"]},{"department":"العلوم","type":"ثقافة عامة","codes":["حيا801/طاق801","كيم802","","فيز804","فيز805","فيز806"]},{"department":"اللغة الإنجليزية - القراءة الشاملة","type":"ثقافة عامة","codes":["","","انج883","انج884","انج885","انج886"]},{"department":"اللغة الإنجليزية - المهارات الاكاديمية","type":"ثقافة عامة","codes":["انج811","انج812","انج815","","انج817","انج820"]},{"department":"اللغة الإنجليزية العامة","type":"ثقافة عامة","codes":["انج801","انج802","انج807","انج808","انج809","انج810"]},{"department":"اللغة العربية","type":"ثقافة عامة","codes":["عرب801","عرب802","عرب803","عرب804","عرب805","عرب806"]},{"department":"الارشاد والتوجيه والتنمية الشخصية","type":"مساندة","codes":["رشد801","رشد802","رشد803","رشد804","رشد805","درب840"]},{"department":"المشروعات الصغيرة وريادة الأعمال","type":"مساندة","codes":["","","","","مشر805","مشر808"]},{"department":"التأمين","type":"مساندة","codes":["","تام802","","","",""]},{"department":"التربية الاقتصادية","type":"مساندة","codes":["قصد801","","","","قصد805",""]},{"department":"المحاسبة","type":"مساندة","codes":["","","محا803","محا804","","محا806"]},{"department":"قانون العمل","type":"مساندة","codes":["","","","","","قان806"]},{"department":"الحاسب الآلي","type":"مساندة","codes":["تقن801","تقن802","تقن881/تقن806","تقن882","",""]},{"department":"الميكانيكا التطبيقية","type":"مساندة","codes":["","","ميك803","ميك804","ميك805","ميك806"]},{"department":"التربية البيئة والتنمية المستدامة","type":"مساندة","codes":["","","","علم812","علم811",""]},{"department":"اساسيات الجودة ونماذج التميز","type":"مساندة","codes":["","","","","جود805",""]},{"department":"الرياضة المالية","type":"مساندة","codes":["","","","","مال805",""]}]}$json$::jsonb) on conflict (id) do update set data = excluded.data;

-- تسجيل تحديث قالب المقررات بسجل العمليات، بنفس أسلوب تحديث الخطة.
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
    'import_curriculum_template',
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

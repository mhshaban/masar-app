-- مسار — إصلاح بيانات لمرة واحدة (وليس تغييرًا بمخطط الجداول): مراجعة كاملة
-- لربط إجراءات خطة القسم ببنود تقرير المتابعة الرسمي، بعد أن صار actionProgress
-- المصدر الوحيد لإنجاز الخطة (راجع مرحلة SQL السابقة 20260804_masar_core_schema.sql
-- والتعديل البرمجي المرافق لهذا الملف).
--
-- ١) يربط ٢٢ إجراءً كانت بلا ربط ببند التقرير المناسب لها (بعد مراجعة المرشد
--    نصًا مقابل الـ٢٦ بندًا الرسمية) — upsert يحافظ على أي حالة/ملاحظات مسجَّلة
--    مسبقًا لتلك الإجراءات، يضيف فقط followUpItemId.
-- ٢) يحذف ٧ إجراءات تأكَّد المرشد إنها نشاطات تنظيمية داخل القسم بحتة بلا أي
--    نظير بتقرير المنطقة التعليمية الرسمي — يحذفها من مصفوفة actions داخل
--    مشروعها بخطة القسم، ويحذف أي سجل actionProgress مرتبط بها (نفس تصرّف
--    deleteAction() بالتطبيق تمامًا، فقط مطبَّق دفعة واحدة هنا).
--
-- تشغيل هذا الملف يدويًا عبر SQL Editor بلوحة تحكم مشروع Supabase الخاص
-- بمسار — مرة واحدة فقط. مبني على افتراض أن أرقام المشاريع (plan-1..plan-15)
-- لم تتغيّر منذ الزرع الأولي (أي مشروع من الـ15 لم يُحذف ويُعاد إنشاؤه من
-- الواجهة) — تحقّق أولًا بالاستعلام السفلي قبل التشغيل لو غير متأكد.

begin;

-- ── ١) حذف الإجراءات السبعة الداخلية البحتة ──────────────────────────────

update public."departmentPlanProjects"
set data = jsonb_set(
  data, '{actions}',
  (select coalesce(jsonb_agg(elem order by (elem->>'no')::int), '[]'::jsonb)
   from jsonb_array_elements(data->'actions') elem
   where (elem->>'no')::int not in (5, 9))
)
where id = 'plan-7';

update public."departmentPlanProjects"
set data = jsonb_set(
  data, '{actions}',
  (select coalesce(jsonb_agg(elem order by (elem->>'no')::int), '[]'::jsonb)
   from jsonb_array_elements(data->'actions') elem
   where (elem->>'no')::int not in (12))
)
where id = 'plan-12';

update public."departmentPlanProjects"
set data = jsonb_set(
  data, '{actions}',
  (select coalesce(jsonb_agg(elem order by (elem->>'no')::int), '[]'::jsonb)
   from jsonb_array_elements(data->'actions') elem
   where (elem->>'no')::int not in (1, 2, 8))
)
where id = 'plan-14';

update public."departmentPlanProjects"
set data = jsonb_set(
  data, '{actions}',
  (select coalesce(jsonb_agg(elem order by (elem->>'no')::int), '[]'::jsonb)
   from jsonb_array_elements(data->'actions') elem
   where (elem->>'no')::int not in (1))
)
where id = 'plan-15';

delete from public."actionProgress"
where id in ('plan-7-a5', 'plan-7-a9', 'plan-12-a12', 'plan-14-a1', 'plan-14-a2', 'plan-14-a8', 'plan-15-a1');

-- ── ٢) ربط الـ٢٢ إجراءً المتبقية ببند التقرير المناسب ────────────────────
-- كل سطر: لو ما فيه سجل actionProgress بعد (الإجراء لم يُفتَح من الأجندة
-- التنفيذية أبدًا) يُنشأ بالقيم الافتراضية (DEFAULT_PROGRESS) مع followUpItemId
-- الجديد؛ ولو فيه سجل موجود (حالة/ملاحظات مسجَّلة فعليًا) يُدمَج معه فقط
-- حقل followUpItemId، بدون المساس بأي حقل آخر.

with links (action_id, followup_id) as (
  values
    ('plan-1-a8', 'followup-4'),
    ('plan-2-a1', 'followup-3'),
    ('plan-2-a2', 'followup-24'),
    ('plan-2-a3', 'followup-24'),
    ('plan-2-a4', 'followup-3'),
    ('plan-2-a5', 'followup-24'),
    ('plan-2-a6', 'followup-3'),
    ('plan-2-a7', 'followup-3'),
    ('plan-7-a1', 'followup-1'),
    ('plan-7-a2', 'followup-10'),
    ('plan-7-a3', 'followup-10'),
    ('plan-7-a4', 'followup-13'),
    ('plan-7-a6', 'followup-3'),
    ('plan-7-a7', 'followup-3'),
    ('plan-7-a8', 'followup-3'),
    ('plan-7-a10', 'followup-2'),
    ('plan-12-a8', 'followup-16'),
    ('plan-14-a3', 'followup-2'),
    ('plan-14-a4', 'followup-9'),
    ('plan-14-a9', 'followup-2'),
    ('plan-15-a2', 'followup-16'),
    ('plan-15-a8', 'followup-19')
)
insert into public."actionProgress" (id, data)
select
  l.action_id,
  jsonb_build_object(
    'id', l.action_id, 'status', 'not_started', 'participantsCount', null,
    'proofNote', null, 'obstacles', null, 'completedDate', null,
    'followUpItemId', l.followup_id, 'effectivenessReport', null, 'attachments', '[]'::jsonb
  )
from links l
on conflict (id) do update
set data = public."actionProgress".data || jsonb_build_object('followUpItemId', excluded.data->>'followUpItemId');

commit;

-- تحقّق سريع بعد التشغيل (اختياري): يجب أن يرجع 0 صفوف في الحالتين.
-- select id, jsonb_array_length(data->'actions') from public."departmentPlanProjects" where id in ('plan-7','plan-12','plan-14','plan-15');
-- select * from public."actionProgress" where id in ('plan-7-a5','plan-7-a9','plan-12-a12','plan-14-a1','plan-14-a2','plan-14-a8','plan-15-a1');

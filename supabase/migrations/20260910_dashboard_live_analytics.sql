-- مسار: نقل ثلاث تحليلات كانت متاحة فقط عبر "تحديث من المجلد" (لقطة محلية
-- من نسخة احتياطية بمجلد OneDrive) إلى استعلام Supabase الخفيف نفسه
-- (masar_dashboard_snapshot_v2)، حتى تصير الرئيسية حيّة دائمًا بلا اعتماد
-- على ملف نسخة احتياطية محلي قد يكون قديمًا: الأضعف أكاديميًا (أعلى 10)،
-- أكثر مقررات مرفّعة معلّقة (أعلى 10)، وتوزيع إجراءات خطة القسم حسب
-- المحور. أُضيف أيضًا totalStudents، وattentionBreakdown/highPriorityCount
-- محسوبان من كامل بيانات الحاجة للمتابعة بدل أول p_attention_limit صفًا
-- فقط — كانا يعتمدان ضمنيًا على اللقطة المحلية غير المبتورة لدقتهما، وبإزالة
-- ذلك المسار يجب حسابهما بدقة هنا بدل الاعتماد على احتساب جزئي بالواجهة.

begin;

create or replace function public.masar_dashboard_snapshot_v2(
  p_stale_days integer default 14,
  p_attention_limit integer default 8
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with
grade_needs as (
  select
    f.data->>'studentId' student_id,
    nullif(f.data->>'overallPct','')::numeric overall_pct,
    coalesce(nullif(f.data->>'barredCount','')::integer,0) barred_count,
    to_jsonb(array_remove(array[
      case when nullif(f.data->>'overallPct','')::numeric < 50
        then 'المعدل العام ' || (f.data->>'overallPct') || '% أقل من 50%' end,
      case when coalesce(s.failing_count,0) > 0
        then 'رسوب في ' || s.failing_count || case when s.failing_count = 1 then ' مادة' else ' مواد' end end,
      case when coalesce(nullif(f.data->>'barredCount','')::integer,0) > 0
        then 'محروم في ' || (f.data->>'barredCount') || case when (f.data->>'barredCount')::integer = 1 then ' مادة' else ' مواد' end end
    ], null)) reasons
  from public."academicFlags" f
  left join lateral (
    select count(*)::integer failing_count
    from jsonb_array_elements(coalesce(f.data->'subjects','[]'::jsonb)) subject
    where nullif(subject->>'pct','')::numeric < 50
  ) s on true
  where f.data->>'studentId' is not null
    and (
      nullif(f.data->>'overallPct','')::numeric < 50
      or coalesce(s.failing_count,0) > 0
      or coalesce(nullif(f.data->>'barredCount','')::integer,0) > 0
    )
),
open_case_students as (
  select distinct data->>'studentId' student_id
  from public."guidanceCases"
  where coalesce(data->>'status','open') <> 'closed'
),
active_plan_students as (
  select distinct data->>'studentId' student_id
  from public."supportPlans"
  where data->>'status' = 'active'
),
case_needs as (
  select g.student_id, jsonb_build_object('type','case','reasons',g.reasons) need
  from grade_needs g left join open_case_students c on c.student_id = g.student_id
  where c.student_id is null
),
support_needs as (
  select g.student_id, jsonb_build_object('type','support','reasons',g.reasons) need
  from grade_needs g left join active_plan_students p on p.student_id = g.student_id
  where p.student_id is null
),
career_needs as (
  select s.id student_id, jsonb_build_object('type','career','reasons',jsonb_build_array('طالب سنة نهائية بلا جلسة توجيه مهني بعد')) need
  from public."students" s
  where s.data->>'level' = 'الثالث'
    and not exists (select 1 from public."careerSessions" c where c.data->>'studentId' = s.id)
),
promoted_grouped as (
  select data->>'studentId' student_id,
    array_agg(data->>'subjectCode') filter (where coalesce((data->>'cleared')::boolean,false) is false) subjects
  from public."promotedSubjects"
  group by data->>'studentId'
),
promoted_needs as (
  select student_id, jsonb_build_object('type','promoted','reasons',jsonb_build_array('مقررات لم تُجتز بعد: ' || array_to_string(subjects,'، '))) need
  from promoted_grouped where coalesce(array_length(subjects,1),0) > 0
),
all_needs as (
  select * from case_needs union all select * from support_needs
  union all select * from career_needs union all select * from promoted_needs
),
attention as (
  select n.student_id, jsonb_agg(n.need order by n.need->>'type') needs
  from all_needs n group by n.student_id
),
attention_limited as (
  select a.student_id, a.needs, s.data student_data
  from attention a left join public."students" s on s.id = a.student_id
  order by jsonb_array_length(a.needs) desc, a.student_id
  limit greatest(1, least(coalesce(p_attention_limit,8),50))
),
attention_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'studentId', student_id,
    'student', case when student_data is null then null else (student_data - 'photo' - 'photoDataUrl') || jsonb_build_object('id',student_id) end,
    'needs', needs
  ) order by jsonb_array_length(needs) desc), '[]'::jsonb) value
  from attention_limited
),
attention_breakdown_json as (
  select jsonb_build_object(
    'case', (select count(*) from case_needs),
    'support', (select count(*) from support_needs),
    'career', (select count(*) from career_needs),
    'promoted', (select count(*) from promoted_needs)
  ) value
),
attention_scored as (
  select a.student_id,
    (select coalesce(sum(
      case n->>'type' when 'case' then 40 when 'support' then 35 when 'promoted' then 25 when 'career' then 15 else 0 end
    ),0) from jsonb_array_elements(a.needs) n) score
  from attention a
),
high_priority_count_val as (
  select count(*)::integer cnt from attention_scored where score >= 60
),
total_students_count as (
  select count(*)::integer cnt from public."students"
),
case_activity as (
  select c.id, c.data, coalesce(max(cs.data->>'date'), c.data->>'openedDate') last_activity
  from public."guidanceCases" c
  left join public."caseSessions" cs on cs.data->>'caseId' = c.id
  where coalesce(c.data->>'status','open') <> 'closed'
  group by c.id, c.data
),
stale_json as (
  select coalesce(jsonb_agg(data || jsonb_build_object('id',id,'lastActivity',last_activity) order by last_activity), '[]'::jsonb) value
  from case_activity
  where last_activity < (current_date - greatest(p_stale_days,1))::text
),
overdue_json as (
  select coalesce(jsonb_agg(
    a.data || jsonb_build_object('id',a.id,'plan',p.data || jsonb_build_object('id',p.id))
    order by a.data->>'dueDate'
  ), '[]'::jsonb) value
  from public."supportPlanActions" a
  join public."supportPlans" p on p.id = a.data->>'planId'
  where p.data->>'status' = 'active'
    and coalesce(a.data->>'status','not_started') <> 'done'
    and nullif(a.data->>'dueDate','') is not null
    and a.data->>'dueDate' < current_date::text
),
plan_actions as (
  select p.id || '-a' || (action->>'no') id
  from public."departmentPlanProjects" p
  cross join lateral jsonb_array_elements(coalesce(p.data->'actions','[]'::jsonb)) action
),
agenda_json as (
  select jsonb_build_object(
    'total', count(*),
    'done', count(*) filter (where coalesce(progress.data->>'status','not_started') = 'done'),
    'ongoing', count(*) filter (where coalesce(progress.data->>'status','not_started') = 'ongoing'),
    'notStarted', count(*) filter (where coalesce(progress.data->>'status','not_started') = 'not_started')
  ) value
  from plan_actions action
  left join public."actionProgress" progress on progress.id = action.id
),
academic_weak_top as (
  select g.student_id, g.overall_pct, g.barred_count, g.reasons, st.data student_data
  from grade_needs g
  join public."students" st on st.id = g.student_id
  order by g.overall_pct asc nulls last, g.barred_count desc, g.student_id
  limit 10
),
academic_weak_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'studentId', student_id,
    'student', (student_data - 'photo' - 'photoDataUrl') || jsonb_build_object('id',student_id),
    'overallPct', overall_pct,
    'barredCount', barred_count,
    'reasons', reasons
  ) order by overall_pct asc nulls last), '[]'::jsonb) value
  from academic_weak_top
),
promoted_top_grouped as (
  select data->>'studentId' student_id,
    array_agg(distinct data->>'subjectCode') filter (where coalesce((data->>'cleared')::boolean,false) is false) subjects
  from public."promotedSubjects"
  group by data->>'studentId'
),
promoted_top as (
  select student_id, subjects
  from promoted_top_grouped
  where coalesce(array_length(subjects,1),0) > 0
  order by array_length(subjects,1) desc, student_id
  limit 10
),
promoted_top_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'studentId', t.student_id,
    'student', (st.data - 'photo' - 'photoDataUrl') || jsonb_build_object('id', t.student_id),
    'subjects', to_jsonb(t.subjects)
  ) order by array_length(t.subjects,1) desc), '[]'::jsonb) value
  from promoted_top t
  join public."students" st on st.id = t.student_id
),
plan_pillar_counts as (
  select p.data->>'pillar' pillar, count(*) cnt
  from public."departmentPlanProjects" p
  cross join lateral jsonb_array_elements(coalesce(p.data->'actions','[]'::jsonb)) action
  where p.data->>'pillar' is not null
  group by p.data->>'pillar'
),
plan_summary_json as (
  select jsonb_build_object(
    'projectCount', (select count(*) from public."departmentPlanProjects"),
    'pillarCounts', coalesce((select jsonb_object_agg(pillar, cnt) from plan_pillar_counts), '{}'::jsonb)
  ) value
)
select jsonb_build_object(
  'agenda', agenda_json.value,
  'attentionCount', (select count(*) from attention),
  'attentionRows', attention_json.value,
  'attentionBreakdown', attention_breakdown_json.value,
  'highPriorityCount', (select cnt from high_priority_count_val),
  'totalStudents', (select cnt from total_students_count),
  'staleCases', stale_json.value,
  'overdueSupportActions', overdue_json.value,
  'academicWeak', academic_weak_json.value,
  'promotedTop', promoted_top_json.value,
  'planSummary', plan_summary_json.value
)
from agenda_json, attention_json, attention_breakdown_json, stale_json, overdue_json,
     academic_weak_json, promoted_top_json, plan_summary_json;
$$;

revoke all on function public.masar_dashboard_snapshot_v2(integer, integer) from public;
grant execute on function public.masar_dashboard_snapshot_v2(integer, integer) to authenticated;

commit;

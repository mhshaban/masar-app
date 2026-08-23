-- لقطة واحدة للرئيسية بدل عدة قراءات متكررة ومشكلة N+1.
begin;

create or replace function public.masar_dashboard_snapshot(p_stale_days integer default 14)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with
grade_flags as (
  select * from public.masar_grade_summaries(50)
),
open_case_students as (
  select distinct data->>'studentId' student_id from public."guidanceCases" where coalesce(data->>'status','open') <> 'closed'
),
active_plan_students as (
  select distinct data->>'studentId' student_id from public."supportPlans" where data->>'status' = 'active'
),
case_needs as (
  select g.student_id, jsonb_build_object('type','case','reasons',to_jsonb(g.reasons)) need
  from grade_flags g left join open_case_students c on c.student_id = g.student_id
  where c.student_id is null
),
support_needs as (
  select g.student_id, jsonb_build_object('type','support','reasons',to_jsonb(g.reasons)) need
  from grade_flags g left join active_plan_students p on p.student_id = g.student_id
  where p.student_id is null
),
career_needs as (
  select s.id student_id, jsonb_build_object('type','career','reasons',jsonb_build_array('طالب سنة نهائية بلا جلسة توجيه مهني بعد')) need
  from public."students" s
  where s.data->>'level' = 'الثالث'
    and not exists (select 1 from public."careerSessions" c where c.data->>'studentId' = s.id)
),
promoted_grouped as (
  select data->>'studentId' student_id, array_agg(data->>'subjectCode') filter (where coalesce((data->>'cleared')::boolean,false) is false) subjects
  from public."promotedSubjects"
  group by data->>'studentId'
),
promoted_needs as (
  select student_id, jsonb_build_object('type','promoted','reasons',jsonb_build_array('مقررات لم تُجتز بعد: ' || array_to_string(subjects,'، '))) need
  from promoted_grouped where coalesce(array_length(subjects,1),0) > 0
),
all_needs as (
  select * from case_needs union all select * from support_needs union all select * from career_needs union all select * from promoted_needs
),
attention as (
  select n.student_id, jsonb_agg(n.need order by n.need->>'type') needs
  from all_needs n group by n.student_id
),
attention_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'studentId', a.student_id,
    'student', case when s.id is null then null else (s.data - 'photo') || jsonb_build_object('id',s.id) end,
    'needs', a.needs
  ) order by jsonb_array_length(a.needs) desc), '[]'::jsonb) value
  from attention a left join public."students" s on s.id = a.student_id
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
  select p.id || '-a' || action->>'no' id
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
)
select jsonb_build_object(
  'agenda', agenda_json.value,
  'attentionRows', attention_json.value,
  'staleCases', stale_json.value,
  'overdueSupportActions', overdue_json.value
)
from agenda_json, attention_json, stale_json, overdue_json;
$$;

revoke all on function public.masar_dashboard_snapshot(integer) from public;
grant execute on function public.masar_dashboard_snapshot(integer) to authenticated;

commit;

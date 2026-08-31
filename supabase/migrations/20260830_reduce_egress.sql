-- يقلل نقل البيانات إلى المتصفح: الرئيسية ترجع ثمانية طلاب فقط مع العدد
-- الإجمالي، ودليل المعلمين لا يعيد الصور إلا عند طلب صورة محددة.
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
)
select jsonb_build_object(
  'agenda', agenda_json.value,
  'attentionCount', (select count(*) from attention),
  'attentionRows', attention_json.value,
  'staleCases', stale_json.value,
  'overdueSupportActions', overdue_json.value
)
from agenda_json, attention_json, stale_json, overdue_json;
$$;

revoke all on function public.masar_dashboard_snapshot_v2(integer, integer) from public;
grant execute on function public.masar_dashboard_snapshot_v2(integer, integer) to authenticated;

create or replace function public.masar_teacher_directory(
  p_query text default '',
  p_offset integer default 0,
  p_limit integer default 25
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with filtered as (
  select id, data
  from public."schoolTeachers"
  where coalesce(trim(p_query),'') = '' or concat_ws(' ',
    data->>'name', data->>'nameEn', data->>'personalNo', data->>'employeeNo',
    data->>'department', data->>'jobTitle', data->>'email'
  ) ilike '%' || trim(p_query) || '%'
), page as (
  select id,
    (data - 'photoDataUrl') || jsonb_build_object('id',id,'hasPhoto',coalesce(data->>'photoDataUrl','') <> '') item
  from filtered
  order by data->>'name', id
  offset greatest(coalesce(p_offset,0),0)
  limit greatest(1, least(coalesce(p_limit,25),100))
)
select jsonb_build_object(
  'total', (select count(*) from filtered),
  'rows', coalesce((select jsonb_agg(item) from page),'[]'::jsonb)
);
$$;

revoke all on function public.masar_teacher_directory(text, integer, integer) from public;
grant execute on function public.masar_teacher_directory(text, integer, integer) to authenticated;

create or replace function public.masar_teacher_photo(p_id text)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select data->>'photoDataUrl' from public."schoolTeachers" where id = p_id;
$$;

revoke all on function public.masar_teacher_photo(text) from public;
grant execute on function public.masar_teacher_photo(text) to authenticated;

commit;

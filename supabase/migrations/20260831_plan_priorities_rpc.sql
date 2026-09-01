-- تفاصيل أولويات الخطة دون تنزيل مشاريع الخطة أو سجلات التنفيذ ومرفقاتها.
create or replace function public.masar_plan_priorities(p_limit integer default 6)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with settings as (
  select (now() at time zone 'Asia/Bahrain')::date today,
    greatest(1, least(coalesce(p_limit,6),25)) row_limit
), actions as (
  select p.id || '-a' || (elem.value->>'no') id,
    p.data->>'pillar' pillar,
    p.data->>'project_title' project_title,
    p.data->>'program_name' program_name,
    elem.value->>'action' action,
    nullif(elem.value->>'periodStart','') period_start,
    nullif(elem.value->>'periodEnd','') period_end,
    coalesce(progress.data->>'status','not_started') status
  from public."departmentPlanProjects" p
  cross join lateral jsonb_array_elements(coalesce(p.data->'actions','[]'::jsonb)) as elem(value)
  left join public."actionProgress" progress on progress.id = p.id || '-a' || (elem.value->>'no')
), pending as (
  select * from actions where status <> 'done'
), overdue as (
  select * from pending, settings
  where coalesce(period_end,period_start) < today::text
  order by coalesce(period_end,period_start)
), upcoming as (
  select * from pending, settings
  where period_start >= today::text and period_start <= (today + 14)::text
  order by period_start
), undated as (
  select * from pending where period_start is null and period_end is null
), counts as (
  select
    (select count(*) from overdue) overdue_count,
    (select count(*) from upcoming) upcoming_count,
    (select count(*) from undated) undated_count,
    (select row_limit from settings) row_limit
)
select jsonb_build_object(
  'overdueCount', overdue_count,
  'upcomingCount', upcoming_count,
  'undatedCount', undated_count,
  'overdue', coalesce((select jsonb_agg(to_jsonb(x) - 'today' - 'row_limit') from (select * from overdue limit (select row_limit from settings)) x),'[]'::jsonb),
  'upcoming', coalesce((select jsonb_agg(to_jsonb(x) - 'today' - 'row_limit') from (select * from upcoming limit (select row_limit from settings)) x),'[]'::jsonb),
  'undated', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from undated limit (select row_limit from settings)) x),'[]'::jsonb)
)
from counts;
$$;

revoke all on function public.masar_plan_priorities(integer) from public;
grant execute on function public.masar_plan_priorities(integer) to authenticated;

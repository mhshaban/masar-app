-- بحث وتقسيم صفحات سجل الطلبة من قاعدة البيانات دون تنزيل السجل كاملًا.
begin;

create or replace function public.masar_student_roster_meta()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'total', count(*),
    'flagged', count(*) filter (where nullif(data->>'supportNeeded', '') is not null or nullif(data->>'socialGuidance', '') is not null),
    'unmatched', count(*) filter (where nullif(data->>'academicId', '') is null or nullif(data->>'level', '') is null),
    'byLevel', coalesce((select jsonb_object_agg(level, n) from (
      select coalesce(nullif(data->>'level', ''), 'غير محدد') level, count(*) n
      from public."students" group by 1
    ) levels), '{}'::jsonb),
    'levels', coalesce((select jsonb_agg(value order by value) from (select distinct data->>'level' value from public."students" where nullif(data->>'level','') is not null) x), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(value order by value) from (select distinct data->>'department' value from public."students" where nullif(data->>'department','') is not null) x), '[]'::jsonb),
    'tracks', coalesce((select jsonb_agg(value order by value) from (select distinct data->>'track' value from public."students" where nullif(data->>'track','') is not null) x), '[]'::jsonb)
  )
  from public."students";
$$;

create or replace function public.masar_search_students(
  p_query text default '',
  p_level text default null,
  p_department text default null,
  p_track text default null,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table(id text, data jsonb, total_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select s.id, s.data
    from public."students" s
    where (nullif(p_level, '') is null or s.data->>'level' = p_level)
      and (nullif(p_department, '') is null or s.data->>'department' = p_department)
      and (nullif(p_track, '') is null or s.data->>'track' = p_track)
      and (
        nullif(trim(p_query), '') is null
        or coalesce(s.data->>'name', '') ilike '%' || trim(p_query) || '%'
        or coalesce(s.data->>'nameEn', '') ilike '%' || trim(p_query) || '%'
        or coalesce(s.data->>'academicId', '') ilike '%' || trim(p_query) || '%'
        or coalesce(s.data->>'civilId', '') ilike '%' || trim(p_query) || '%'
        or coalesce(s.data->>'section', '') ilike '%' || trim(p_query) || '%'
      )
  )
  select f.id, f.data - 'photo', count(*) over() total_count
  from filtered f
  order by coalesce(f.data->>'name', ''), f.id
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.masar_student_roster_meta() from public;
revoke all on function public.masar_search_students(text,text,text,text,integer,integer) from public;
grant execute on function public.masar_student_roster_meta() to authenticated;
grant execute on function public.masar_search_students(text,text,text,text,integer,integer) to authenticated;

commit;

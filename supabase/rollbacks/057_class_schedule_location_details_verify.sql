-- 057 verify (read-only). Expect all PASS after applying 057.

with
fn as (
  select
    p.oid,
    oidvectortypes(p.proargtypes) as arg_types,
    p.prosecdef,
    coalesce(p.proconfig, array[]::text[]) as proconfig,
    pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_class_schedule_day_with_sessions'
),
cols as (
  select column_name
  from information_schema.columns
  where table_schema = 'public' and table_name = 'class_schedule_days'
),
checks as (
  select 'location_details_column'::text as check_name,
    case when exists (
      select 1 from cols where column_name = 'location_details'
    ) then 'PASS' else 'FAIL' end as status,
    '{}'::jsonb as detail
  union all
  select 'legacy_columns_retained',
    case when exists (select 1 from cols where column_name = 'address')
      and exists (select 1 from cols where column_name = 'map_url')
      and exists (select 1 from cols where column_name = 'room_note')
    then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'create_rpc_5arg_only',
    case when exists (
      select 1 from fn where arg_types = 'date, text, text, jsonb, uuid'
    ) and (select count(*) from fn) = 1
    then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'overloads', coalesce((select jsonb_agg(arg_types) from fn), '[]'::jsonb)
    )
  union all
  select 'create_rpc_old_7arg_absent',
    case when not exists (
      select 1 from fn where arg_types = 'date, text, text, text, text, jsonb, uuid'
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'create_rpc_service_role_only',
    case when
      has_function_privilege(
        'service_role',
        'public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        'public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid)',
        'EXECUTE'
      )
    then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'create_rpc_security_definer_search_path',
    case when exists (
      select 1 from fn
      where arg_types = 'date, text, text, jsonb, uuid'
        and prosecdef
        and proconfig @> array['search_path=public']
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'create_rpc_writes_location_details',
    case when exists (
      select 1 from fn
      where arg_types = 'date, text, text, jsonb, uuid'
        and def ilike '%location_details%'
        and def ilike '%p_location_details%'
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'row_counts',
    'PASS',
    jsonb_build_object(
      'days', (select count(*)::int from public.class_schedule_days),
      'sessions', (select count(*)::int from public.class_schedule_sessions)
    )
)
select check_name, status, detail
from checks
order by check_name;

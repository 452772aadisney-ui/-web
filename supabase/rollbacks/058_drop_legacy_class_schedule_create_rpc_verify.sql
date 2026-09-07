-- 058 verify (read-only). Run only after 058 cleanup.

with
fn as (
  select oidvectortypes(p.proargtypes) as arg_types
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_class_schedule_day_with_sessions'
),
checks as (
  select 'create_rpc_5arg_only'::text as check_name,
    case when exists (
      select 1 from fn where arg_types = 'date, text, text, jsonb, uuid'
    ) and (select count(*) from fn) = 1
    then 'PASS' else 'FAIL' end as status,
    jsonb_build_object(
      'overloads', coalesce((select jsonb_agg(arg_types) from fn), '[]'::jsonb)
    ) as detail
  union all
  select 'create_rpc_7arg_absent',
    case when not exists (
      select 1 from fn where arg_types = 'date, text, text, text, text, jsonb, uuid'
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'create_rpc_5arg_service_role_only',
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
)
select check_name, status, detail
from checks
order by check_name;

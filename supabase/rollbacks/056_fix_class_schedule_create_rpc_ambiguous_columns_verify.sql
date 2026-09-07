-- 056_fix_class_schedule_create_rpc_ambiguous_columns 適用後の読み取り専用検証
-- DB を変更しません。全行 PASS を確認してください。

with
fn_base as (
  select
    p.oid,
    p.proname,
    p.pronargs,
    oidvectortypes(p.proargtypes) as arg_types,
    pg_get_function_identity_arguments(p.oid) as identity_args,
    p.prosecdef,
    coalesce(p.proconfig, array[]::text[]) as proconfig,
    pg_get_userbyid(p.proowner) as owner_name,
    pg_get_functiondef(p.oid) as function_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_class_schedule_day_with_sessions'
),
create_fn as (
  select *
  from fn_base
  where arg_types = 'date, text, text, text, text, jsonb, uuid'
),
table_counts as (
  select
    (select count(*)::int from public.class_schedule_days) as days_count,
    (select count(*)::int from public.class_schedule_sessions) as sessions_count,
    to_regclass('public.class_schedule_days') is not null as days_exists,
    to_regclass('public.class_schedule_sessions') is not null as sessions_exists
),
checks as (
  select 'create_rpc_new_7arg_only'::text as check_name,
    case when exists (select 1 from create_fn)
      and (select count(*) from fn_base) = 1
    then 'PASS' else 'FAIL' end as status,
    jsonb_build_object(
      'overloads', coalesce((
        select jsonb_agg(jsonb_build_object('arg_types', arg_types))
        from fn_base
      ), '[]'::jsonb)
    ) as detail
  union all
  select 'create_rpc_old_6arg_absent',
    case when not exists (
      select 1 from fn_base
      where arg_types = 'date, text, text, text, text, jsonb'
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'create_rpc_service_role_only_execute',
    case when
      not has_function_privilege(
        'public',
        'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)',
        'EXECUTE'
      )
      and has_function_privilege(
        'service_role',
        'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)',
        'EXECUTE'
      )
    then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'create_rpc_security_definer_search_path',
    case when exists (
      select 1 from create_fn
      where prosecdef
        and proconfig @> array['search_path=public']
    ) then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'owner', (select owner_name from create_fn limit 1)
    )
  union all
  select 'create_rpc_returning_qualified',
    case when exists (
      select 1 from create_fn
      where function_def ~* 'returning[[:space:]]+csd\.id[[:space:]]*,[[:space:]]*csd\.notify_revision'
        and function_def !~* 'returning[[:space:]]+id[[:space:]]*,[[:space:]]*notify_revision'
    ) then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'has_csd_returning', exists (
        select 1 from create_fn
        where function_def ~* 'returning[[:space:]]+csd\.id'
      ),
      'has_bare_notify_returning', exists (
        select 1 from create_fn
        where function_def ~* 'returning[[:space:]]+id[[:space:]]*,[[:space:]]*notify_revision'
      )
    )
  union all
  select 'create_rpc_service_role_gate_present',
    case when exists (
      select 1 from create_fn
      where function_def like '%auth.role()%'
        and function_def like '%service_role%'
        and function_def like '%p_actor_id%'
        and function_def like '%admin%'
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'tables_unchanged_exist',
    case when (select days_exists and sessions_exists from table_counts)
    then 'PASS' else 'FAIL' end,
    (select to_jsonb(table_counts) from table_counts)
  union all
  select 'data_counts_reported',
    'PASS',
    jsonb_build_object(
      'days_count', (select days_count from table_counts),
      'sessions_count', (select sessions_count from table_counts),
      'note', 'Compare to pre-apply counts; 056 must not change rows by itself.'
    )
)
select check_name, status, detail
from checks
order by check_name;

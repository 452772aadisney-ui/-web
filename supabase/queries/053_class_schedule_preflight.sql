-- 053_class_schedule 適用前の読み取り専用 preflight
-- Supabase Dashboard > SQL Editor で一括実行。DB を変更しません。
-- 用途: 失敗した 053 実行のあと、全体rollbackか部分適用かを把握する。
-- 本番データの DELETE/UPDATE/DROP は行わない。

with
days_exists as (
  select to_regclass('public.class_schedule_days') is not null as ok
),
sessions_exists as (
  select to_regclass('public.class_schedule_sessions') is not null as ok
),
days_rls as (
  select coalesce(
    (
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'class_schedule_days'
    ),
    false
  ) as ok
),
sessions_rls as (
  select coalesce(
    (
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'class_schedule_sessions'
    ),
    false
  ) as ok
),
policies as (
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'table', tablename,
            'policy', policyname,
            'cmd', cmd,
            'qual', qual,
            'with_check', with_check
          )
          order by tablename, policyname
        )
        from pg_policies
        where schemaname = 'public'
          and tablename in ('class_schedule_days', 'class_schedule_sessions')
      ),
      '[]'::jsonb
    ) as rows
),
kisotsu_overloads as (
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'identity_args', pg_get_function_identity_arguments(p.oid),
            'oid', p.oid,
            'prosecdef', p.prosecdef,
            'proconfig', p.proconfig
          )
          order by pg_get_function_identity_arguments(p.oid)
        )
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'is_kisotsu_profile'
      ),
      '[]'::jsonb
    ) as rows,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'is_kisotsu_profile'
        and pg_get_function_identity_arguments(p.oid) = 'uuid'
    ) as has_uuid,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'is_kisotsu_profile'
        and pg_get_function_identity_arguments(p.oid) = ''
    ) as has_noarg
),
create_rpc as (
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'identity_args', pg_get_function_identity_arguments(p.oid),
          'prosecdef', p.prosecdef
        )
        order by pg_get_function_identity_arguments(p.oid)
      )
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'create_class_schedule_day_with_sessions'
    ),
    '[]'::jsonb
  ) as rows
),
bump_rpc as (
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'identity_args', pg_get_function_identity_arguments(p.oid),
          'prosecdef', p.prosecdef
        )
        order by pg_get_function_identity_arguments(p.oid)
      )
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'bump_class_schedule_notify_revision'
    ),
    '[]'::jsonb
  ) as rows
),
rpc_exec as (
  select
    case
      when to_regprocedure(
        'public.create_class_schedule_day_with_sessions(date,text,text,text,text,jsonb,uuid)'
      ) is null then null
      else jsonb_build_object(
        'public', has_function_privilege(
          'public',
          'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)',
          'EXECUTE'
        ),
        'anon', has_function_privilege(
          'anon',
          'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)',
          'EXECUTE'
        ),
        'authenticated', has_function_privilege(
          'authenticated',
          'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)',
          'EXECUTE'
        ),
        'service_role', has_function_privilege(
          'service_role',
          'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)',
          'EXECUTE'
        )
      )
    end as create_exec,
    case
      when to_regprocedure('public.bump_class_schedule_notify_revision(uuid,uuid)') is null
        then null
      else jsonb_build_object(
        'public', has_function_privilege(
          'public',
          'public.bump_class_schedule_notify_revision(uuid, uuid)',
          'EXECUTE'
        ),
        'anon', has_function_privilege(
          'anon',
          'public.bump_class_schedule_notify_revision(uuid, uuid)',
          'EXECUTE'
        ),
        'authenticated', has_function_privilege(
          'authenticated',
          'public.bump_class_schedule_notify_revision(uuid, uuid)',
          'EXECUTE'
        ),
        'service_role', has_function_privilege(
          'service_role',
          'public.bump_class_schedule_notify_revision(uuid, uuid)',
          'EXECUTE'
        )
      )
    end as bump_exec
),
triggers as (
  select coalesce(
    (
      select jsonb_agg(t.tgname order by t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('class_schedule_days', 'class_schedule_sessions')
        and not t.tgisinternal
    ),
    '[]'::jsonb
  ) as names
),
indexes as (
  select coalesce(
    (
      select jsonb_agg(indexname order by indexname)
      from pg_indexes
      where schemaname = 'public'
        and tablename in ('class_schedule_days', 'class_schedule_sessions')
    ),
    '[]'::jsonb
  ) as names
),
constraints as (
  select coalesce(
    (
      select jsonb_agg(con.conname order by con.conname)
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('class_schedule_days', 'class_schedule_sessions')
    ),
    '[]'::jsonb
  ) as names
),
notif_054 as (
  select
    exists (
      select 1
      from pg_enum e
      join pg_type t on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname = 'push_notification_type'
        and e.enumlabel = 'class_schedule'
    ) as enum_class_schedule,
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notification_preferences'
        and column_name = 'class_schedule'
    ) as prefs_class_schedule_col
),
interpretation as (
  select
    case
      when not (select ok from days_exists)
       and not (select ok from sessions_exists)
       and not (select has_uuid from kisotsu_overloads)
       and not (select has_noarg from kisotsu_overloads)
       and jsonb_array_length((select rows from create_rpc)) = 0
       and jsonb_array_length((select rows from bump_rpc)) = 0
      then 'likely_full_rollback_or_never_applied'
      when (select ok from days_exists)
       and (select has_uuid from kisotsu_overloads)
      then 'partial_or_old_053_uuid_helper_still_present'
      when (select ok from days_exists)
       and (select has_noarg from kisotsu_overloads)
       and not (select has_uuid from kisotsu_overloads)
      then 'tables_present_helper_looks_new_verify_needed'
      else 'inspect_details'
    end as guess
)
select
  (select guess from interpretation) as state_guess,
  (select ok from days_exists) as class_schedule_days_exists,
  (select ok from sessions_exists) as class_schedule_sessions_exists,
  (select ok from days_rls) as days_rls_enabled,
  (select ok from sessions_rls) as sessions_rls_enabled,
  (select rows from policies) as policies,
  (select rows from kisotsu_overloads) as is_kisotsu_profile_overloads,
  (select has_uuid from kisotsu_overloads) as has_is_kisotsu_profile_uuid,
  (select has_noarg from kisotsu_overloads) as has_is_kisotsu_profile_noarg,
  (select rows from create_rpc) as create_rpc_overloads,
  (select rows from bump_rpc) as bump_rpc_overloads,
  (select create_exec from rpc_exec) as create_rpc_execute,
  (select bump_exec from rpc_exec) as bump_rpc_execute,
  (select names from triggers) as triggers,
  (select names from indexes) as indexes,
  (select names from constraints) as constraints,
  (select enum_class_schedule from notif_054) as enum_class_schedule_present,
  (select prefs_class_schedule_col from notif_054) as prefs_class_schedule_column_present,
  case
    when not (select enum_class_schedule from notif_054)
     and not (select prefs_class_schedule_col from notif_054)
    then '054_not_applied_ok'
    else '054_partial_or_applied_investigate'
  end as migration_054_status;

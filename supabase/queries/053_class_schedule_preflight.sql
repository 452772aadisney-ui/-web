-- 053/055 共通: 授業予定 部分適用状態の読み取り専用 preflight
-- Supabase Dashboard > SQL Editor で一括実行。DB を変更しません。
--
-- 判定は pg_proc.pronargs + oidvectortypes(proargtypes) を使い、
-- 引数名（例: p_uid）に依存しない。identity_args は表示用のみ。

with
fn_base as (
  select
    p.oid,
    p.proname,
    p.pronargs,
    oidvectortypes(p.proargtypes) as arg_types,
    pg_get_function_identity_arguments(p.oid) as identity_args,
    p.prosecdef,
    p.proconfig,
    pg_get_userbyid(p.proowner) as owner_name
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'is_kisotsu_profile',
      'create_class_schedule_day_with_sessions',
      'bump_class_schedule_notify_revision'
    )
),
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
  select coalesce(
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
kisotsu as (
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'identity_args', identity_args,
            'arg_types', arg_types,
            'pronargs', pronargs,
            'prosecdef', prosecdef,
            'proconfig', proconfig,
            'owner', owner_name
          )
          order by arg_types
        )
        from fn_base
        where proname = 'is_kisotsu_profile'
      ),
      '[]'::jsonb
    ) as overloads,
    exists (
      select 1 from fn_base
      where proname = 'is_kisotsu_profile' and pronargs = 0
    ) as has_noarg,
    exists (
      select 1 from fn_base
      where proname = 'is_kisotsu_profile'
        and pronargs = 1
        and arg_types = 'uuid'
    ) as has_uuid,
    (
      select count(*)::int from fn_base where proname = 'is_kisotsu_profile'
    ) as overload_count
),
create_rpc as (
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'identity_args', identity_args,
            'arg_types', arg_types,
            'pronargs', pronargs,
            'prosecdef', prosecdef,
            'proconfig', proconfig,
            'owner', owner_name
          )
          order by arg_types
        )
        from fn_base
        where proname = 'create_class_schedule_day_with_sessions'
      ),
      '[]'::jsonb
    ) as overloads,
    exists (
      select 1 from fn_base
      where proname = 'create_class_schedule_day_with_sessions'
        and arg_types = 'date, text, text, text, text, jsonb'
    ) as has_old_6arg,
    exists (
      select 1 from fn_base
      where proname = 'create_class_schedule_day_with_sessions'
        and arg_types = 'date, text, text, text, text, jsonb, uuid'
    ) as has_new_7arg,
    (
      select count(*)::int
      from fn_base
      where proname = 'create_class_schedule_day_with_sessions'
    ) as overload_count
),
bump_rpc as (
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'identity_args', identity_args,
            'arg_types', arg_types,
            'pronargs', pronargs,
            'prosecdef', prosecdef,
            'proconfig', proconfig,
            'owner', owner_name
          )
          order by arg_types
        )
        from fn_base
        where proname = 'bump_class_schedule_notify_revision'
      ),
      '[]'::jsonb
    ) as overloads,
    exists (
      select 1 from fn_base
      where proname = 'bump_class_schedule_notify_revision'
        and arg_types = 'uuid, uuid'
    ) as has_expected,
    (
      select count(*)::int
      from fn_base
      where proname = 'bump_class_schedule_notify_revision'
    ) as overload_count
),
rpc_exec as (
  select
    case
      when not exists (
        select 1 from fn_base
        where proname = 'create_class_schedule_day_with_sessions'
          and arg_types = 'date, text, text, text, text, jsonb'
      ) then null
      else jsonb_build_object(
        'public', has_function_privilege(
          'public',
          'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb)',
          'EXECUTE'
        ),
        'anon', has_function_privilege(
          'anon',
          'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb)',
          'EXECUTE'
        ),
        'authenticated', has_function_privilege(
          'authenticated',
          'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb)',
          'EXECUTE'
        ),
        'service_role', has_function_privilege(
          'service_role',
          'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb)',
          'EXECUTE'
        )
      )
    end as create_old_6arg_execute,
    case
      when not exists (
        select 1 from fn_base
        where proname = 'create_class_schedule_day_with_sessions'
          and arg_types = 'date, text, text, text, text, jsonb, uuid'
      ) then null
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
    end as create_new_7arg_execute,
    case
      when not exists (
        select 1 from fn_base
        where proname = 'bump_class_schedule_notify_revision'
          and arg_types = 'uuid, uuid'
      ) then null
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
    end as bump_execute
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
       and (select overload_count from kisotsu) = 0
       and (select overload_count from create_rpc) = 0
       and (select overload_count from bump_rpc) = 0
      then 'likely_empty_or_never_applied'
      when (select ok from days_exists)
       and (select has_uuid from kisotsu)
       and (select has_old_6arg from create_rpc)
      then 'partial_old_053_uuid_helper_and_old_create_rpc'
      when (select ok from days_exists)
       and (select has_uuid from kisotsu)
      then 'partial_old_053_uuid_helper_still_present'
      when (select ok from days_exists)
       and (select has_noarg from kisotsu)
       and not (select has_uuid from kisotsu)
       and (select has_new_7arg from create_rpc)
       and not (select has_old_6arg from create_rpc)
      then 'looks_repaired_or_latest_053_run_verify_needed'
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
  (select overloads from kisotsu) as is_kisotsu_profile_overloads,
  (select has_uuid from kisotsu) as has_is_kisotsu_profile_uuid,
  (select has_noarg from kisotsu) as has_is_kisotsu_profile_noarg,
  (select overload_count from kisotsu) as is_kisotsu_profile_overload_count,
  (select overloads from create_rpc) as create_rpc_overloads,
  (select has_old_6arg from create_rpc) as has_create_rpc_old_6arg,
  (select has_new_7arg from create_rpc) as has_create_rpc_new_7arg,
  (select overload_count from create_rpc) as create_rpc_overload_count,
  (select overloads from bump_rpc) as bump_rpc_overloads,
  (select has_expected from bump_rpc) as has_bump_rpc_expected,
  (select overload_count from bump_rpc) as bump_rpc_overload_count,
  (select create_old_6arg_execute from rpc_exec) as create_old_6arg_execute,
  (select create_new_7arg_execute from rpc_exec) as create_new_7arg_execute,
  (select bump_execute from rpc_exec) as bump_execute,
  (select names from triggers) as triggers,
  (select names from indexes) as indexes,
  (select names from constraints) as constraints,
  (select enum_class_schedule from notif_054) as enum_class_schedule_present,
  (select prefs_class_schedule_col from notif_054) as prefs_class_schedule_column_present,
  case
    when not (select enum_class_schedule from notif_054)
     and not (select prefs_class_schedule_col from notif_054)
    then '054_not_applied'
    when (select enum_class_schedule from notif_054)
     and (select prefs_class_schedule_col from notif_054)
    then '054_objects_present'
    else '054_partial'
  end as migration_054_status;

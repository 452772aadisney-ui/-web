-- 055_repair_class_schedule_partial_migration 適用後の読み取り専用検証
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
tables as (
  select
    to_regclass('public.class_schedule_days') is not null as days_ok,
    to_regclass('public.class_schedule_sessions') is not null as sessions_ok
),
rls as (
  select
    coalesce((
      select c.relrowsecurity from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'class_schedule_days'
    ), false) as days_rls,
    coalesce((
      select c.relrowsecurity from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'class_schedule_sessions'
    ), false) as sessions_rls
),
days_cols as (
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'class_schedule_days'
),
sessions_cols as (
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'class_schedule_sessions'
),
policies as (
  select policyname, tablename, cmd, qual
  from pg_policies
  where schemaname = 'public'
    and tablename in ('class_schedule_days', 'class_schedule_sessions')
),
data_health as (
  select
    (select count(*)::int from public.class_schedule_days) as days_count,
    (select count(*)::int from public.class_schedule_sessions) as sessions_count,
    (
      select count(*)::int
      from public.class_schedule_sessions a
      join public.class_schedule_sessions b
        on a.day_id = b.day_id and a.id < b.id
       and a.status = 'scheduled' and b.status = 'scheduled'
       and a.start_time < b.end_time and b.start_time < a.end_time
    ) as overlap_pairs,
    (
      select count(*)::int from public.class_schedule_sessions
      where end_time <= start_time
    ) as bad_times,
    (
      select count(*)::int from public.class_schedule_days
      where status not in ('scheduled', 'cancelled')
         or (map_url is not null and char_length(trim(map_url)) > 0 and map_url !~* '^https://')
    ) as bad_days,
    (
      select count(*)::int from public.class_schedule_sessions
      where status not in ('scheduled', 'cancelled')
    ) as bad_session_status
),
prefs as (
  select
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notification_preferences'
        and column_name = 'class_schedule'
        and is_nullable = 'NO'
        and column_default like '%true%'
    ) as col_ok,
    exists (
      select 1
      from pg_enum e
      join pg_type t on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname = 'push_notification_type'
        and e.enumlabel = 'class_schedule'
    ) as enum_ok,
    coalesce(
      (
        select pg_get_constraintdef(c.oid)
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'notification_preference_changes'
          and c.conname = 'notification_preference_changes_category_check'
      ),
      ''
    ) as audit_def
),
checks as (
  select 'tables_exist'::text as check_name,
    case when (select days_ok and sessions_ok from tables) then 'PASS' else 'FAIL' end as status,
    '{}'::jsonb as details
  union all
  select 'days_rls_enabled',
    case when (select days_rls from rls) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'sessions_rls_enabled',
    case when (select sessions_rls from rls) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'days_required_columns',
    case when (
      select count(*) from days_cols
      where column_name in (
        'id','schedule_date','venue_name','address','map_url','room_note',
        'status','notify_revision','created_by','updated_by','created_at','updated_at'
      )
    ) = 12 then 'PASS' else 'FAIL' end,
    jsonb_build_object('columns', coalesce((select jsonb_agg(column_name order by column_name) from days_cols), '[]'::jsonb))
  union all
  select 'sessions_required_columns',
    case when (
      select count(*) from sessions_cols
      where column_name in (
        'id','day_id','start_time','end_time','subject','note','status','created_at','updated_at'
      )
    ) = 9 then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'days_notify_revision_default_not_null',
    case when exists (
      select 1 from days_cols
      where column_name = 'notify_revision' and is_nullable = 'NO' and column_default like '%0%'
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'days_schedule_date_unique',
    case when exists (
      select 1 from pg_constraint where conname = 'class_schedule_days_schedule_date_unique'
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'sessions_end_after_start',
    case when exists (
      select 1 from pg_constraint where conname = 'class_schedule_sessions_end_after_start'
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'sessions_day_fk',
    case when exists (
      select 1 from pg_constraint where conname = 'class_schedule_sessions_day_id_fkey'
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'overlap_trigger',
    case when exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'class_schedule_sessions'
        and t.tgname = 'class_schedule_sessions_overlap_check'
        and not t.tgisinternal
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'days_select_policy',
    case when exists (
      select 1 from policies
      where tablename = 'class_schedule_days' and policyname = 'class_schedule_days_select' and cmd = 'SELECT'
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'sessions_select_policy',
    case when exists (
      select 1 from policies
      where tablename = 'class_schedule_sessions' and policyname = 'class_schedule_sessions_select' and cmd = 'SELECT'
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'days_select_uses_noarg_kisotsu',
    case when exists (
      select 1 from policies
      where policyname = 'class_schedule_days_select'
        and qual like '%is_kisotsu_profile()%'
        and qual not like '%is_kisotsu_profile(auth%'
    ) then 'PASS' else 'FAIL' end,
    jsonb_build_object('qual', (select qual from policies where policyname = 'class_schedule_days_select' limit 1))
  union all
  select 'sessions_select_uses_noarg_kisotsu',
    case when exists (
      select 1 from policies
      where policyname = 'class_schedule_sessions_select'
        and qual like '%is_kisotsu_profile()%'
        and qual not like '%is_kisotsu_profile(auth%'
    ) then 'PASS' else 'FAIL' end,
    jsonb_build_object('qual', (select qual from policies where policyname = 'class_schedule_sessions_select' limit 1))
  union all
  select 'admin_write_policies_days',
    case when (
      select count(*) from policies
      where tablename = 'class_schedule_days'
        and policyname in (
          'class_schedule_days_insert_admin',
          'class_schedule_days_update_admin',
          'class_schedule_days_delete_admin'
        )
    ) = 3 then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'admin_write_policies_sessions',
    case when (
      select count(*) from policies
      where tablename = 'class_schedule_sessions'
        and policyname in (
          'class_schedule_sessions_insert_admin',
          'class_schedule_sessions_update_admin',
          'class_schedule_sessions_delete_admin'
        )
    ) = 3 then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'kisotsu_uuid_absent',
    case when not exists (
      select 1 from fn_base
      where proname = 'is_kisotsu_profile' and pronargs = 1 and arg_types = 'uuid'
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'kisotsu_noarg_only',
    case when exists (
      select 1 from fn_base where proname = 'is_kisotsu_profile' and pronargs = 0
    ) and (
      select count(*) from fn_base where proname = 'is_kisotsu_profile'
    ) = 1 then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'overloads', coalesce((
        select jsonb_agg(jsonb_build_object('arg_types', arg_types, 'identity_args', identity_args))
        from fn_base where proname = 'is_kisotsu_profile'
      ), '[]'::jsonb)
    )
  union all
  select 'kisotsu_security_definer_search_path',
    case when exists (
      select 1 from fn_base
      where proname = 'is_kisotsu_profile' and pronargs = 0
        and prosecdef
        and proconfig @> array['search_path=public']
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'create_rpc_old_6arg_absent',
    case when not exists (
      select 1 from fn_base
      where proname = 'create_class_schedule_day_with_sessions'
        and arg_types = 'date, text, text, text, text, jsonb'
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'create_rpc_new_7arg_only',
    case when exists (
      select 1 from fn_base
      where proname = 'create_class_schedule_day_with_sessions'
        and arg_types = 'date, text, text, text, text, jsonb, uuid'
    ) and (
      select count(*) from fn_base where proname = 'create_class_schedule_day_with_sessions'
    ) = 1 then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'create_rpc_service_role_only_execute',
    case when
      not has_function_privilege('public', 'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)', 'EXECUTE')
    then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'create_rpc_security_definer_search_path',
    case when exists (
      select 1 from fn_base
      where proname = 'create_class_schedule_day_with_sessions'
        and arg_types = 'date, text, text, text, text, jsonb, uuid'
        and prosecdef
        and proconfig @> array['search_path=public']
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'bump_rpc_one_expected',
    case when exists (
      select 1 from fn_base
      where proname = 'bump_class_schedule_notify_revision' and arg_types = 'uuid, uuid'
    ) and (
      select count(*) from fn_base where proname = 'bump_class_schedule_notify_revision'
    ) = 1 then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'bump_rpc_service_role_only_execute',
    case when
      not has_function_privilege('public', 'public.bump_class_schedule_notify_revision(uuid, uuid)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.bump_class_schedule_notify_revision(uuid, uuid)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.bump_class_schedule_notify_revision(uuid, uuid)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.bump_class_schedule_notify_revision(uuid, uuid)', 'EXECUTE')
    then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'bump_rpc_security_definer_search_path',
    case when exists (
      select 1 from fn_base
      where proname = 'bump_class_schedule_notify_revision'
        and arg_types = 'uuid, uuid'
        and prosecdef
        and proconfig @> array['search_path=public']
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'enum_class_schedule',
    case when (select enum_ok from prefs) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'prefs_class_schedule_column',
    case when (select col_ok from prefs) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'audit_category_includes_class_schedule',
    case when (select audit_def from prefs) like '%class_schedule%'
      and (select audit_def from prefs) like '%study_reminder%'
    then 'PASS' else 'FAIL' end,
    jsonb_build_object('constraint', (select audit_def from prefs))
  union all
  select 'data_no_overlapping_scheduled',
    case when (select overlap_pairs from data_health) = 0 then 'PASS' else 'FAIL' end,
    jsonb_build_object('overlap_pairs', (select overlap_pairs from data_health))
  union all
  select 'data_no_invalid_times',
    case when (select bad_times from data_health) = 0 then 'PASS' else 'FAIL' end,
    jsonb_build_object('bad_times', (select bad_times from data_health))
  union all
  select 'data_no_invalid_day_fields',
    case when (select bad_days from data_health) = 0 then 'PASS' else 'FAIL' end,
    jsonb_build_object('bad_days', (select bad_days from data_health))
  union all
  select 'data_no_invalid_session_status',
    case when (select bad_session_status from data_health) = 0 then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'data_row_counts',
    'INFO',
    jsonb_build_object(
      'days', (select days_count from data_health),
      'sessions', (select sessions_count from data_health)
    )
)
select check_name, status, details
from checks
order by check_name;

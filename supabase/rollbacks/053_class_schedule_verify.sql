-- 053_class_schedule 適用後の読み取り専用検証
-- Supabase Dashboard > SQL Editor で一括実行。DB を変更しません。
-- 適用順確認: 053 の後に実行。054 の前でも可。

with
days_exists as (
  select to_regclass('public.class_schedule_days') is not null as ok
),
sessions_exists as (
  select to_regclass('public.class_schedule_sessions') is not null as ok
),
kisotsu_fn as (
  select
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'is_kisotsu_profile'
        and pg_get_function_identity_arguments(p.oid) = ''
    ) as exists_ok,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'is_kisotsu_profile'
        and pg_get_function_identity_arguments(p.oid) = ''
        and p.prosecdef
        and coalesce(p.proconfig, array[]::text[]) @> array['search_path=public']
    ) as security_ok,
    (
      select count(*)::int
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_kisotsu_profile'
    ) as overload_count,
    (
      select pg_get_userbyid(p.proowner)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'is_kisotsu_profile'
        and pg_get_function_identity_arguments(p.oid) = ''
      limit 1
    ) as owner_name
),
create_rpc as (
  select
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'create_class_schedule_day_with_sessions'
        and pg_get_function_identity_arguments(p.oid) =
          'p_schedule_date date, p_venue_name text, p_address text, p_map_url text, p_room_note text, p_sessions jsonb, p_actor_id uuid'
        and p.prosecdef
        and coalesce(p.proconfig, array[]::text[]) @> array['search_path=public']
    ) as ok,
    (
      select count(*)::int
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_class_schedule_day_with_sessions'
    ) as overload_count,
    (
      select pg_get_userbyid(p.proowner)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'create_class_schedule_day_with_sessions'
        and pg_get_function_identity_arguments(p.oid) like '%p_actor_id uuid'
      limit 1
    ) as owner_name
),
bump_rpc as (
  select
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'bump_class_schedule_notify_revision'
        and pg_get_function_identity_arguments(p.oid) = 'p_day_id uuid, p_updated_by uuid'
        and p.prosecdef
        and coalesce(p.proconfig, array[]::text[]) @> array['search_path=public']
    ) as ok,
    (
      select count(*)::int
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'bump_class_schedule_notify_revision'
    ) as overload_count,
    (
      select pg_get_userbyid(p.proowner)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'bump_class_schedule_notify_revision'
        and pg_get_function_identity_arguments(p.oid) = 'p_day_id uuid, p_updated_by uuid'
      limit 1
    ) as owner_name
),
fn_privs as (
  select
    has_function_privilege(
      'public',
      'public.is_kisotsu_profile()',
      'EXECUTE'
    ) as kisotsu_public_exec,
    has_function_privilege(
      'anon',
      'public.is_kisotsu_profile()',
      'EXECUTE'
    ) as kisotsu_anon_exec,
    has_function_privilege(
      'authenticated',
      'public.is_kisotsu_profile()',
      'EXECUTE'
    ) as kisotsu_auth_exec,
    has_function_privilege(
      'service_role',
      'public.is_kisotsu_profile()',
      'EXECUTE'
    ) as kisotsu_service_exec,
    has_function_privilege(
      'public',
      'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)',
      'EXECUTE'
    ) as create_public_exec,
    has_function_privilege(
      'anon',
      'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)',
      'EXECUTE'
    ) as create_anon_exec,
    has_function_privilege(
      'authenticated',
      'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)',
      'EXECUTE'
    ) as create_auth_exec,
    has_function_privilege(
      'service_role',
      'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)',
      'EXECUTE'
    ) as create_service_exec,
    has_function_privilege(
      'public',
      'public.bump_class_schedule_notify_revision(uuid, uuid)',
      'EXECUTE'
    ) as bump_public_exec,
    has_function_privilege(
      'anon',
      'public.bump_class_schedule_notify_revision(uuid, uuid)',
      'EXECUTE'
    ) as bump_anon_exec,
    has_function_privilege(
      'authenticated',
      'public.bump_class_schedule_notify_revision(uuid, uuid)',
      'EXECUTE'
    ) as bump_auth_exec,
    has_function_privilege(
      'service_role',
      'public.bump_class_schedule_notify_revision(uuid, uuid)',
      'EXECUTE'
    ) as bump_service_exec
),
days_rls as (
  select c.relrowsecurity as ok
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'class_schedule_days'
),
sessions_rls as (
  select c.relrowsecurity as ok
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'class_schedule_sessions'
),
days_cols as (
  select column_name, column_default, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'class_schedule_days'
),
sessions_cols as (
  select column_name, column_default, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'class_schedule_sessions'
),
days_constraints as (
  select conname
  from pg_constraint
  where conrelid = 'public.class_schedule_days'::regclass
),
sessions_constraints as (
  select conname
  from pg_constraint
  where conrelid = 'public.class_schedule_sessions'::regclass
),
days_indexes as (
  select indexname
  from pg_indexes
  where schemaname = 'public' and tablename = 'class_schedule_days'
),
sessions_indexes as (
  select indexname
  from pg_indexes
  where schemaname = 'public' and tablename = 'class_schedule_sessions'
),
days_policies as (
  select policyname, cmd
  from pg_policies
  where schemaname = 'public' and tablename = 'class_schedule_days'
),
sessions_policies as (
  select policyname, cmd
  from pg_policies
  where schemaname = 'public' and tablename = 'class_schedule_sessions'
),
overlap_trigger as (
  select exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'class_schedule_sessions'
      and t.tgname = 'class_schedule_sessions_overlap_check'
      and not t.tgisinternal
  ) as ok
),
days_updated_at_trigger as (
  select exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'class_schedule_days'
      and t.tgname = 'class_schedule_days_updated_at'
      and not t.tgisinternal
  ) as ok
),
sessions_updated_at_trigger as (
  select exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'class_schedule_sessions'
      and t.tgname = 'class_schedule_sessions_updated_at'
      and not t.tgisinternal
  ) as ok
),
days_grants as (
  select has_table_privilege('authenticated', 'public.class_schedule_days', 'SELECT') as sel,
         has_table_privilege('authenticated', 'public.class_schedule_days', 'INSERT') as ins,
         has_table_privilege('authenticated', 'public.class_schedule_days', 'UPDATE') as upd,
         has_table_privilege('authenticated', 'public.class_schedule_days', 'DELETE') as del
),
sessions_grants as (
  select has_table_privilege('authenticated', 'public.class_schedule_sessions', 'SELECT') as sel,
         has_table_privilege('authenticated', 'public.class_schedule_sessions', 'INSERT') as ins,
         has_table_privilege('authenticated', 'public.class_schedule_sessions', 'UPDATE') as upd,
         has_table_privilege('authenticated', 'public.class_schedule_sessions', 'DELETE') as del
),
checks as (
  select 'days_table_exists'::text as check_name,
    case when (select ok from days_exists) then 'PASS' else 'FAIL' end as status,
    '{}'::jsonb as details
  union all
  select 'sessions_table_exists',
    case when (select ok from sessions_exists) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'is_kisotsu_profile_exists',
    case when (select exists_ok from kisotsu_fn) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'is_kisotsu_profile_security_definer_search_path',
    case when (select security_ok from kisotsu_fn) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'is_kisotsu_profile_no_uuid_overload',
    case when (select overload_count from kisotsu_fn) = 1 then 'PASS' else 'FAIL' end,
    jsonb_build_object('overload_count', (select overload_count from kisotsu_fn))
  union all
  select 'is_kisotsu_profile_execute_grants',
    case
      when not (select kisotsu_public_exec from fn_privs)
       and not (select kisotsu_anon_exec from fn_privs)
       and (select kisotsu_auth_exec from fn_privs)
       and (select kisotsu_service_exec from fn_privs)
      then 'PASS' else 'FAIL'
    end,
    jsonb_build_object(
      'public', (select kisotsu_public_exec from fn_privs),
      'anon', (select kisotsu_anon_exec from fn_privs),
      'authenticated', (select kisotsu_auth_exec from fn_privs),
      'service_role', (select kisotsu_service_exec from fn_privs),
      'owner', (select owner_name from kisotsu_fn)
    )
  union all
  select 'create_rpc_exists',
    case when (select ok from create_rpc) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'create_rpc_single_overload',
    case when (select overload_count from create_rpc) = 1 then 'PASS' else 'FAIL' end,
    jsonb_build_object('overload_count', (select overload_count from create_rpc))
  union all
  select 'create_rpc_execute_service_role_only',
    case
      when not (select create_public_exec from fn_privs)
       and not (select create_anon_exec from fn_privs)
       and not (select create_auth_exec from fn_privs)
       and (select create_service_exec from fn_privs)
      then 'PASS' else 'FAIL'
    end,
    jsonb_build_object(
      'public', (select create_public_exec from fn_privs),
      'anon', (select create_anon_exec from fn_privs),
      'authenticated', (select create_auth_exec from fn_privs),
      'service_role', (select create_service_exec from fn_privs),
      'owner', (select owner_name from create_rpc)
    )
  union all
  select 'bump_rpc_exists',
    case when (select ok from bump_rpc) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'bump_rpc_single_overload',
    case when (select overload_count from bump_rpc) = 1 then 'PASS' else 'FAIL' end,
    jsonb_build_object('overload_count', (select overload_count from bump_rpc))
  union all
  select 'bump_rpc_execute_service_role_only',
    case
      when not (select bump_public_exec from fn_privs)
       and not (select bump_anon_exec from fn_privs)
       and not (select bump_auth_exec from fn_privs)
       and (select bump_service_exec from fn_privs)
      then 'PASS' else 'FAIL'
    end,
    jsonb_build_object(
      'public', (select bump_public_exec from fn_privs),
      'anon', (select bump_anon_exec from fn_privs),
      'authenticated', (select bump_auth_exec from fn_privs),
      'service_role', (select bump_service_exec from fn_privs),
      'owner', (select owner_name from bump_rpc)
    )
  union all
  select 'days_rls_enabled',
    case when coalesce((select ok from days_rls), false) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'sessions_rls_enabled',
    case when coalesce((select ok from sessions_rls), false) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'days_required_columns',
    case when (
      select count(*) from days_cols
      where column_name in (
        'id', 'schedule_date', 'venue_name', 'address', 'map_url', 'room_note',
        'status', 'notify_revision', 'created_by', 'updated_by', 'created_at', 'updated_at'
      )
    ) = 12 then 'PASS' else 'FAIL' end,
    jsonb_build_object('columns', coalesce((select jsonb_agg(column_name order by column_name) from days_cols), '[]'::jsonb))
  union all
  select 'days_notify_revision_default',
    case when exists (
      select 1 from days_cols
      where column_name = 'notify_revision'
        and is_nullable = 'NO'
        and column_default like '%0%'
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'sessions_required_columns',
    case when (
      select count(*) from sessions_cols
      where column_name in (
        'id', 'day_id', 'start_time', 'end_time', 'subject', 'note',
        'status', 'created_at', 'updated_at'
      )
    ) = 9 then 'PASS' else 'FAIL' end,
    jsonb_build_object('columns', coalesce((select jsonb_agg(column_name order by column_name) from sessions_cols), '[]'::jsonb))
  union all
  select 'days_schedule_date_unique',
    case when exists (
      select 1 from days_constraints where conname = 'class_schedule_days_schedule_date_unique'
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'days_map_url_https_check',
    case when exists (
      select 1 from days_constraints where conname = 'class_schedule_days_map_url_https'
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'sessions_end_after_start_check',
    case when exists (
      select 1 from sessions_constraints where conname = 'class_schedule_sessions_end_after_start'
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'days_indexes',
    case when exists (
      select 1 from days_indexes where indexname = 'class_schedule_days_schedule_date_idx'
    ) and exists (
      select 1 from days_indexes where indexname = 'class_schedule_days_status_date_idx'
    ) then 'PASS' else 'FAIL' end,
    jsonb_build_object('indexes', coalesce((select jsonb_agg(indexname order by indexname) from days_indexes), '[]'::jsonb))
  union all
  select 'sessions_day_id_index',
    case when exists (
      select 1 from sessions_indexes where indexname = 'class_schedule_sessions_day_id_idx'
    ) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'days_write_policies',
    case when (
      select count(*) from days_policies
      where (policyname, cmd) in (
        ('class_schedule_days_select', 'SELECT'),
        ('class_schedule_days_insert_admin', 'INSERT'),
        ('class_schedule_days_update_admin', 'UPDATE'),
        ('class_schedule_days_delete_admin', 'DELETE')
      )
    ) = 4 then 'PASS' else 'FAIL' end,
    jsonb_build_object('policies', coalesce((
      select jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd) order by policyname)
      from days_policies
    ), '[]'::jsonb))
  union all
  select 'sessions_write_policies',
    case when (
      select count(*) from sessions_policies
      where (policyname, cmd) in (
        ('class_schedule_sessions_select', 'SELECT'),
        ('class_schedule_sessions_insert_admin', 'INSERT'),
        ('class_schedule_sessions_update_admin', 'UPDATE'),
        ('class_schedule_sessions_delete_admin', 'DELETE')
      )
    ) = 4 then 'PASS' else 'FAIL' end,
    jsonb_build_object('policies', coalesce((
      select jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd) order by policyname)
      from sessions_policies
    ), '[]'::jsonb))
  union all
  select 'sessions_overlap_trigger',
    case when (select ok from overlap_trigger) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'days_updated_at_trigger',
    case when (select ok from days_updated_at_trigger) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'sessions_updated_at_trigger',
    case when (select ok from sessions_updated_at_trigger) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'days_authenticated_grants',
    case when (select sel and ins and upd and del from days_grants) then 'PASS' else 'FAIL' end, '{}'::jsonb
  union all
  select 'sessions_authenticated_grants',
    case when (select sel and ins and upd and del from sessions_grants) then 'PASS' else 'FAIL' end, '{}'::jsonb
)
select check_name, status, details
from checks
order by check_name;

-- 051_notification_preferences_admin_control 適用後の読み取り専用検証
-- Supabase Dashboard > SQL Editor で一括実行。DB を変更しません。

with
prefs_grants as (
  select privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'notification_preferences'
    and grantee = 'authenticated'
),
prefs_anon_grants as (
  select privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'notification_preferences'
    and grantee = 'anon'
),
prefs_policies as (
  select policyname, cmd
  from pg_policies
  where schemaname = 'public'
    and tablename = 'notification_preferences'
),
audit_exists as (
  select exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname = 'notification_preference_changes'
  ) as ok
),
audit_grants as (
  select privilege_type, grantee
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'notification_preference_changes'
    and grantee in ('anon', 'authenticated')
),
audit_rls as (
  select c.relrowsecurity as rls_on
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'notification_preference_changes'
),
checks as (
  select
    'prefs_authenticated_select_only'::text as check_name,
    case
      when exists (select 1 from prefs_grants where privilege_type = 'SELECT')
       and not exists (select 1 from prefs_grants where privilege_type in ('INSERT', 'UPDATE', 'DELETE'))
      then 'PASS' else 'FAIL'
    end as status,
    jsonb_build_object(
      'grants', coalesce((select jsonb_agg(privilege_type order by privilege_type) from prefs_grants), '[]'::jsonb)
    ) as details

  union all
  select
    'prefs_anon_no_grants',
    case when not exists (select 1 from prefs_anon_grants) then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'grants', coalesce((select jsonb_agg(privilege_type order by privilege_type) from prefs_anon_grants), '[]'::jsonb)
    )

  union all
  select
    'prefs_select_own_policy',
    case
      when exists (
        select 1 from prefs_policies
        where policyname = 'notification_preferences_select_own' and cmd = 'SELECT'
      ) then 'PASS' else 'FAIL'
    end,
    jsonb_build_object(
      'policies', coalesce((select jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd) order by policyname) from prefs_policies), '[]'::jsonb)
    )

  union all
  select
    'prefs_no_write_policies',
    case
      when not exists (
        select 1 from prefs_policies where cmd in ('INSERT', 'UPDATE', 'DELETE')
      ) then 'PASS' else 'FAIL'
    end,
    jsonb_build_object(
      'write_policies', coalesce((
        select jsonb_agg(policyname order by policyname)
        from prefs_policies where cmd in ('INSERT', 'UPDATE', 'DELETE')
      ), '[]'::jsonb)
    )

  union all
  select
    'audit_table_exists',
    case when (select ok from audit_exists) then 'PASS' else 'FAIL' end,
    '{}'::jsonb

  union all
  select
    'audit_rls_enabled',
    case when coalesce((select rls_on from audit_rls), false) then 'PASS' else 'FAIL' end,
    '{}'::jsonb

  union all
  select
    'audit_no_client_grants',
    case when not exists (select 1 from audit_grants) then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'grants', coalesce((
        select jsonb_agg(jsonb_build_object('grantee', grantee, 'privilege', privilege_type) order by grantee, privilege_type)
        from audit_grants
      ), '[]'::jsonb)
    )

  union all
  select
    'prefs_data_not_mutated_by_migration'::text,
    'INFO'::text,
    jsonb_build_object(
      'note', '既存 boolean 値は 051 で変更されない。件数は false_counts SQL で確認。'
    )
)
select check_name, status, details
from checks
order by check_name;

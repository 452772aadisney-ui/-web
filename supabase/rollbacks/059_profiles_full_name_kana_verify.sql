-- 059 verify (READ-ONLY). Run after applying 059.
-- SELECT only — no mutations. No PII (no names, emails, UUIDs, kana values).

with
col as (
  select
    data_type,
    is_nullable,
    column_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'full_name_kana'
),
fn_protect as (
  select
    p.prosecdef as is_security_definer,
    coalesce(p.proconfig::text, '') as search_path_config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'protect_full_name_kana'
  limit 1
),
fn_exec as (
  select
    has_function_privilege(
      'anon',
      'public.protect_full_name_kana()',
      'EXECUTE'
    ) as anon_execute,
    has_function_privilege(
      'authenticated',
      'public.protect_full_name_kana()',
      'EXECUTE'
    ) as authenticated_execute
),
handle_src as (
  select pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'handle_new_user'
  limit 1
),
counts as (
  select
    count(*)::bigint as profiles_total,
    count(*) filter (where role = 'student')::bigint as students_total,
    count(*) filter (where full_name_kana is not null)::bigint as kana_nonnull_total
  from public.profiles
),
rls as (
  select coalesce(c.relrowsecurity, false) as profiles_rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'profiles'
),
privs as (
  select
    has_table_privilege('anon', 'public.profiles', 'UPDATE') as anon_update,
    has_table_privilege('authenticated', 'public.profiles', 'UPDATE') as authenticated_update,
    has_table_privilege('service_role', 'public.profiles', 'UPDATE') as service_role_update
),
checks as (
  select 'column_exists_text_nullable'::text as check_name,
    case when exists (
      select 1 from col
      where data_type = 'text' and is_nullable = 'YES'
    ) then 'PASS' else 'FAIL' end as status,
    '{}'::jsonb as detail
  union all
  select 'no_column_default',
    case when exists (
      select 1 from col where column_default is null
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'length_check',
    case when exists (
      select 1 from pg_constraint where conname = 'profiles_full_name_kana_length'
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'not_blank_check',
    case when exists (
      select 1 from pg_constraint where conname = 'profiles_full_name_kana_not_blank'
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'charset_check',
    case when exists (
      select 1 from pg_constraint where conname = 'profiles_full_name_kana_charset'
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'protect_trigger',
    case when exists (
      select 1 from pg_trigger
      where tgname = 'profiles_protect_full_name_kana'
        and not tgisinternal
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'protect_function_security',
    case when exists (
      select 1 from fn_protect
      where is_security_definer
        and search_path_config ilike '%search_path=public%'
    ) then 'PASS' else 'FAIL' end,
    coalesce(
      (select jsonb_build_object(
        'security_definer', is_security_definer,
        'search_path_config', search_path_config
      ) from fn_protect),
      '{}'::jsonb
    )
  union all
  select 'protect_function_no_client_execute',
    case when exists (
      select 1 from fn_exec
      where anon_execute = false
        and authenticated_execute = false
    ) then 'PASS' else 'FAIL' end,
    coalesce((select to_jsonb(fn_exec) from fn_exec), '{}'::jsonb)
  union all
  select 'handle_new_user_mentions_kana',
    case when exists (
      select 1 from handle_src
      where def ilike '%full_name_kana%'
        and def ilike '%generate_student_code%'
        and def ilike '%grade_tag%'
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'profiles_rls_still_enabled',
    case when (select profiles_rls_enabled from rls) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'no_forced_backfill_info',
    -- INFO: immediately after apply, non-null kana should be 0 unless admins already wrote values.
    -- Always PASS; detail carries counts only (no PII).
    'PASS',
    (select jsonb_build_object(
      'profiles_total', profiles_total,
      'students_total', students_total,
      'kana_nonnull_total', kana_nonnull_total
    ) from counts)
  union all
  select 'grants_snapshot_info',
    'PASS',
    (select to_jsonb(privs) from privs)
)
select * from checks order by check_name;

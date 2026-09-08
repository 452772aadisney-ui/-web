-- 059 precheck (READ-ONLY). Run before applying 059.
-- SELECT only — no INSERT/UPDATE/DELETE/ALTER/DROP/CREATE.
-- Counts / flags only — no PII (no names, emails, UUIDs, kana values).

with
profiles_table as (
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'profiles'
  ) as profiles_table_exists
),
col as (
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'full_name_kana'
  ) as full_name_kana_column_present
),
counts as (
  select
    (select count(*)::bigint from public.profiles) as profiles_total,
    (
      select count(*)::bigint
      from public.profiles
      where role = 'student'
    ) as students_total
),
rls as (
  select coalesce(c.relrowsecurity, false) as profiles_rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'profiles'
),
fns as (
  select
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'handle_new_user'
    ) as handle_new_user_present,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'protect_student_code'
    ) as protect_student_code_fn_present,
    exists (
      select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'profiles'
        and t.tgname = 'profiles_protect_student_code'
        and not t.tgisinternal
    ) as protect_student_code_trigger_present,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'protect_full_name_kana'
    ) as protect_full_name_kana_fn_present
),
privs as (
  select
    has_table_privilege('anon', 'public.profiles', 'SELECT') as anon_select,
    has_table_privilege('anon', 'public.profiles', 'INSERT') as anon_insert,
    has_table_privilege('anon', 'public.profiles', 'UPDATE') as anon_update,
    has_table_privilege('anon', 'public.profiles', 'DELETE') as anon_delete,
    has_table_privilege('authenticated', 'public.profiles', 'SELECT') as authenticated_select,
    has_table_privilege('authenticated', 'public.profiles', 'INSERT') as authenticated_insert,
    has_table_privilege('authenticated', 'public.profiles', 'UPDATE') as authenticated_update,
    has_table_privilege('authenticated', 'public.profiles', 'DELETE') as authenticated_delete,
    has_table_privilege('service_role', 'public.profiles', 'SELECT') as service_role_select,
    has_table_privilege('service_role', 'public.profiles', 'INSERT') as service_role_insert,
    has_table_privilege('service_role', 'public.profiles', 'UPDATE') as service_role_update,
    has_table_privilege('service_role', 'public.profiles', 'DELETE') as service_role_delete
)
select
  pt.profiles_table_exists,
  c.full_name_kana_column_present,
  cnt.profiles_total,
  cnt.students_total,
  r.profiles_rls_enabled,
  f.handle_new_user_present,
  f.protect_student_code_fn_present,
  f.protect_student_code_trigger_present,
  f.protect_full_name_kana_fn_present,
  p.anon_select,
  p.anon_insert,
  p.anon_update,
  p.anon_delete,
  p.authenticated_select,
  p.authenticated_insert,
  p.authenticated_update,
  p.authenticated_delete,
  p.service_role_select,
  p.service_role_insert,
  p.service_role_update,
  p.service_role_delete,
  case
    when pt.profiles_table_exists
      and not c.full_name_kana_column_present
      and f.handle_new_user_present
      and f.protect_student_code_fn_present
      and f.protect_student_code_trigger_present
      and r.profiles_rls_enabled
    then 1
    else 0
  end as ready_for_059
from profiles_table pt
cross join col c
cross join counts cnt
cross join rls r
cross join fns f
cross join privs p;

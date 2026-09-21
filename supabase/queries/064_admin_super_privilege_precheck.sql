-- 064 precheck (READ-ONLY). Safe before AND after 064.
-- Counts / flags only — no PII (no names, emails, UUIDs). Does not mutate data.
-- Does not run 064. Rollout: docs/admin-super-privilege-rollout.md
--
-- Expectation before apply: is_super_admin column ABSENT; helpers ABSENT.
-- Expectation after apply: column PRESENT; helpers PRESENT; super_admin_count may be 0
-- until explicit UUID bootstrap (never infer from name/order).
--
-- IMPORTANT: Do not reference profiles.is_super_admin (or other not-yet-added
-- columns) by name anywhere in this statement. PostgreSQL analyzes all CASE
-- branches, so a "then count where is_super_admin" arm fails on pre-064 DBs
-- even when the column-existence check is false. Use information_schema /
-- pg_catalog for presence, and to_jsonb(row) ->> 'col' for optional values.
-- Optional tables (admin_privilege_audit) are probed with to_regclass only —
-- never FROM them in this statement.

with state as (
  select
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'is_super_admin'
    ) as has_is_super_admin_col,
    to_regclass('public.admin_privilege_audit') is not null as has_audit_table,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_super_admin' and p.pronargs = 0
    ) as has_is_super_admin_fn,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_kisotsu_student' and p.pronargs = 1
    ) as has_is_kisotsu_student_fn,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'admin_can_access_student' and p.pronargs = 1
    ) as has_admin_can_access_student_fn,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'set_admin_super_privilege' and p.pronargs = 2
    ) as has_set_admin_super_privilege_fn,
    exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'profiles'
        and t.tgname = 'profiles_protect_admin_privilege'
        and not t.tgisinternal
    ) as has_protect_update_trigger,
    exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'profiles'
        and t.tgname = 'profiles_protect_admin_privilege_insert'
        and not t.tgisinternal
    ) as has_protect_insert_trigger,
    -- student_tags predates 064 (required app dependency on production).
    exists (
      select 1
      from public.student_tags st
      where coalesce(to_jsonb(st) ->> 'category', '') = '学年'
        and coalesce(to_jsonb(st) ->> 'name', '') = '既卒'
    ) as has_kisotsu_tag,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_admin' and p.pronargs = 0
    ) as has_is_admin_fn,
    (
      select count(*)::bigint
      from public.profiles p
      where p.role = 'admin'
        and coalesce((to_jsonb(p) ->> 'is_super_admin')::boolean, false)
    ) as super_admin_count
)
select
  '064_depends_on_is_admin'::text as check_name,
  case when has_is_admin_fn then 'PASS' else 'FAIL_APPLY_DEPS_FIRST' end as status,
  'public.is_admin()'::text as details
from state

union all

select
  '064_kisotsu_grade_tag'::text,
  case when has_kisotsu_tag then 'PRESENT' else 'ABSENT_WARN' end,
  'student_tags category=学年 name=既卒'::text
from state

union all

select
  '064_is_super_admin_column'::text,
  case when has_is_super_admin_col then 'PRESENT' else 'ABSENT' end,
  'profiles.is_super_admin'::text
from state

union all

select
  '064_is_super_admin_fn'::text,
  case when has_is_super_admin_fn then 'PRESENT' else 'ABSENT' end,
  'is_super_admin()'::text
from state

union all

select
  '064_is_kisotsu_student_fn'::text,
  case when has_is_kisotsu_student_fn then 'PRESENT' else 'ABSENT' end,
  'is_kisotsu_student(uuid)'::text
from state

union all

select
  '064_admin_can_access_student_fn'::text,
  case when has_admin_can_access_student_fn then 'PRESENT' else 'ABSENT' end,
  'admin_can_access_student(uuid)'::text
from state

union all

select
  '064_set_admin_super_privilege_fn'::text,
  case when has_set_admin_super_privilege_fn then 'PRESENT' else 'ABSENT' end,
  'set_admin_super_privilege(uuid,boolean)'::text
from state

union all

select
  '064_admin_privilege_audit_table'::text,
  case when has_audit_table then 'PRESENT' else 'ABSENT' end,
  'admin_privilege_audit'::text
from state

union all

select
  '064_protect_update_trigger'::text,
  case when has_protect_update_trigger then 'PRESENT' else 'ABSENT' end,
  'profiles_protect_admin_privilege'::text
from state

union all

select
  '064_protect_insert_trigger'::text,
  case when has_protect_insert_trigger then 'PRESENT' else 'ABSENT' end,
  'profiles_protect_admin_privilege_insert'::text
from state

union all

select
  '064_profiles_row_count'::text,
  'INFO'::text,
  (select count(*)::text from public.profiles)

union all

select
  '064_admin_row_count'::text,
  'INFO'::text,
  (
    select count(*)::text from public.profiles where role = 'admin'
  )

union all

select
  '064_super_admin_row_count'::text,
  case when has_is_super_admin_col then 'INFO' else 'ABSENT' end,
  case
    when has_is_super_admin_col then super_admin_count::text
    else super_admin_count::text || ' (column_absent)'
  end
from state;

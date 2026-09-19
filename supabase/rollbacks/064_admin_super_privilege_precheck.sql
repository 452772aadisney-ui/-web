-- 064 rollback precheck (READ-ONLY). Run BEFORE destructive 064 rollback.
-- Counts / flags only — no PII. Does not mutate data.
--
-- WARNING: rollback drops admin_privilege_audit (audit history loss) and
-- profiles.is_super_admin (privilege flag loss). Prefer app revert + leave DB.
-- If 065 is still applied, roll back 065 FIRST.
-- See: docs/admin-super-privilege-rollout.md
-- Rollback SQL: supabase/rollbacks/064_admin_super_privilege_rollback.sql

with state as (
  select
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'is_super_admin'
    ) as has_col,
    to_regclass('public.admin_privilege_audit') is not null as has_audit,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'announcements'
        and column_name = 'audience_scope'
    ) as has_065_audience_scope,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'admin_can_manage_announcement'
    ) as has_065_manage_fn
)
select
  '064_rollback_warn_audit_loss'::text as check_name,
  case when has_audit then 'WARN_DROP_AUDIT_TABLE' else 'OK_NO_AUDIT_TABLE' end as status,
  case
    when has_audit then (
      select format('admin_privilege_audit_rows=%s', count(*))
      from public.admin_privilege_audit
    )
    else 'n/a'::text
  end as details
from state

union all

select
  '064_rollback_warn_privilege_column'::text,
  case when has_col then 'WARN_DROP_IS_SUPER_ADMIN' else 'OK_NO_COLUMN' end,
  case
    when has_col then (
      select format('super_admin_rows=%s', count(*))
      from public.profiles
      where role = 'admin' and is_super_admin = true
    )
    else 'n/a'::text
  end
from state

union all

select
  '064_rollback_requires_065_gone'::text,
  case
    when has_065_audience_scope or has_065_manage_fn
      then 'FAIL_ROLLBACK_065_FIRST'
    else 'PASS'
  end,
  'audience_scope / admin_can_manage_announcement must be absent'::text
from state

union all

select
  '064_rollback_objects_present'::text,
  case
    when has_col or has_audit then 'READY_TO_ROLLBACK'
    else 'NOTHING_TO_ROLLBACK'
  end,
  'is_super_admin col and/or audit table'::text
from state;

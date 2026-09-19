-- 065 precheck (READ-ONLY). Safe before AND after 065.
-- Counts / flags only — no PII. Does not mutate data. Does not run 065.
-- Rollout: docs/admin-super-privilege-rollout.md
--
-- Dependency: apply 064_admin_super_privilege.sql first (+ bootstrap first super).
-- Expectation before apply: audience_scope ABSENT; 064 helpers PRESENT.
-- Expectation after apply: audience_scope PRESENT NOT NULL; graduate-scoped policies.

with state as (
  select
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'is_super_admin'
    ) as has_064_col,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'admin_can_access_student' and p.pronargs = 1
    ) as has_064_access_fn,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_super_admin' and p.pronargs = 0
    ) as has_064_super_fn,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'announcements'
        and column_name = 'audience_scope'
    ) as has_audience_scope,
    exists (
      select 1 from pg_constraint
      where conname = 'announcements_audience_scope_check'
    ) as has_audience_scope_check,
    exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'announcements'
        and t.tgname = 'announcements_sync_audience_scope'
        and not t.tgisinternal
    ) as has_sync_trigger,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'admin_can_manage_announcement'
    ) as has_manage_announcement_fn,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'protect_kisotsu_tag_mutations'
    ) as has_kisotsu_protect_fn,
    exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'class_schedule_days'
        and policyname = 'class_schedule_days_insert_admin'
    ) as has_class_schedule_insert_policy
)
select
  '065_depends_on_064_is_super_admin_col'::text as check_name,
  case when has_064_col then 'PASS' else 'FAIL_APPLY_064_FIRST' end as status,
  'profiles.is_super_admin'::text as details
from state

union all

select
  '065_depends_on_064_helpers'::text,
  case
    when has_064_access_fn and has_064_super_fn then 'PASS'
    else 'FAIL_APPLY_064_FIRST'
  end,
  'is_super_admin + admin_can_access_student'::text
from state

union all

select
  '065_super_admin_bootstrap'::text,
  case
    when not has_064_col then 'SKIP_NO_COLUMN'
    when (
      select count(*)::bigint
      from public.profiles
      where role = 'admin' and is_super_admin = true
    ) >= 1 then 'PRESENT'
    else 'ABSENT_WARN_BOOTSTRAP'
  end,
  'at least one admin with is_super_admin'::text
from state

union all

select
  '065_audience_scope_column'::text,
  case when has_audience_scope then 'PRESENT' else 'ABSENT' end,
  'announcements.audience_scope'::text
from state

union all

select
  '065_audience_scope_check'::text,
  case when has_audience_scope_check then 'PRESENT' else 'ABSENT' end,
  'announcements_audience_scope_check'::text
from state

union all

select
  '065_sync_audience_scope_trigger'::text,
  case when has_sync_trigger then 'PRESENT' else 'ABSENT' end,
  'announcements_sync_audience_scope'::text
from state

union all

select
  '065_admin_can_manage_announcement_fn'::text,
  case when has_manage_announcement_fn then 'PRESENT' else 'ABSENT' end,
  'admin_can_manage_announcement'::text
from state

union all

select
  '065_protect_kisotsu_tag_fn'::text,
  case when has_kisotsu_protect_fn then 'PRESENT' else 'ABSENT' end,
  'protect_kisotsu_tag_mutations'::text
from state

union all

select
  '065_class_schedule_insert_policy'::text,
  case when has_class_schedule_insert_policy then 'PRESENT' else 'ABSENT' end,
  'class_schedule_days_insert_admin'::text
from state

union all

select
  '065_announcements_row_count'::text,
  'INFO'::text,
  (select count(*)::text from public.announcements)

union all

select
  '065_audience_scope_distribution'::text,
  'INFO'::text,
  case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'announcements'
        and column_name = 'audience_scope'
    )
    then (
      select coalesce(
        string_agg(format('%s=%s', audience_scope, cnt), ', ' order by audience_scope),
        'empty'
      )
      from (
        select audience_scope, count(*)::bigint as cnt
        from public.announcements
        group by audience_scope
      ) s
    )
    else 'column_absent'
  end;

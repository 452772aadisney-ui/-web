-- 065 rollback precheck (READ-ONLY). Run BEFORE destructive 065 rollback.
-- Counts / flags only — no PII. Does not mutate data.
--
-- ************************************************************************
-- WARN: Rolling back 065 RE-EXPOSES graduate (既卒) data to regular admins
-- (profiles, study_logs, chat, feedback, achievements, coaching_bookings,
--  class schedule admin CRUD, 既卒 tag mutations). Prefer app revert + keep RLS.
-- ************************************************************************
-- See: docs/admin-super-privilege-rollout.md
-- Rollback SQL: supabase/rollbacks/065_admin_graduate_scope_rls_rollback.sql

with state as (
  select
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'announcements'
        and column_name = 'audience_scope'
    ) as has_audience_scope,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'admin_can_manage_announcement'
    ) as has_manage_fn,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'protect_kisotsu_tag_mutations'
    ) as has_kisotsu_protect,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'is_super_admin'
    ) as has_064_col
)
select
  '065_rollback_warn_reexpose_graduates'::text as check_name,
  'WARN_REEXPOSES_GRADUATE_DATA_TO_REGULAR_ADMINS'::text as status,
  'Prefer keep RLS; app-only revert'::text as details

union all

select
  '065_rollback_audience_scope'::text,
  case when has_audience_scope then 'PRESENT_WILL_DROP' else 'ABSENT' end,
  case
    when has_audience_scope then (
      select format('announcements=%s', count(*))
      from public.announcements
    )
    else 'n/a'::text
  end
from state

union all

select
  '065_rollback_manage_announcement_fn'::text,
  case when has_manage_fn then 'PRESENT_WILL_DROP' else 'ABSENT' end,
  'admin_can_manage_announcement'::text
from state

union all

select
  '065_rollback_kisotsu_protect'::text,
  case when has_kisotsu_protect then 'PRESENT_WILL_DROP' else 'ABSENT' end,
  'protect_kisotsu_tag_mutations'::text
from state

union all

select
  '065_rollback_064_still_present'::text,
  case when has_064_col then 'PASS_064_REMAINS' else 'WARN_064_ALREADY_GONE' end,
  'profiles.is_super_admin (064) should remain unless rolling back 064 next'::text
from state

union all

select
  '065_rollback_objects'::text,
  case
    when has_audience_scope or has_manage_fn or has_kisotsu_protect
      then 'READY_TO_ROLLBACK'
    else 'NOTHING_TO_ROLLBACK'
  end,
  '065 objects'::text
from state;

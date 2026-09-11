-- 061 precheck (READ-ONLY). Safe before AND after 061.
-- Counts / flags only — no PII. Does not mutate data. Does not run 061.
--
-- Dependency: apply 060_coaching_schedule_revision.sql first (app revision lock).
-- Cutover: after 060→061 until new app is verified, pause booking changes
-- (see 060_061_coaching_reschedule_notify_rollout.md). Do not assume free coexistence.
-- Expectation before apply: attempts table / enum unknown may be absent.
-- Expectation after apply: both present; deliveries rows are NOT deleted by 061.

with state as (
  select
    to_regclass('public.notification_delivery_attempts') is not null as has_attempts,
    exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname = 'notification_delivery_status'
        and e.enumlabel = 'unknown'
    ) as has_unknown_enum,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'coaching_bookings'
        and column_name = 'schedule_revision'
    ) as has_060_revision
)
select
  '061_depends_on_060_schedule_revision'::text as check_name,
  case when has_060_revision then 'PASS' else 'FAIL_APPLY_060_FIRST' end as status,
  'coaching_bookings.schedule_revision'::text as details
from state

union all

select
  '061_attempts_table'::text,
  case when has_attempts then 'PRESENT' else 'ABSENT' end,
  'notification_delivery_attempts'::text
from state

union all

select
  '061_enum_unknown'::text,
  case when has_unknown_enum then 'PRESENT' else 'ABSENT' end,
  'notification_delivery_status.unknown'::text
from state

union all

select
  '061_deliveries_row_count'::text,
  'INFO'::text,
  (select count(*)::text from public.notification_deliveries);

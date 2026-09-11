-- 060 precheck (READ-ONLY). Safe before AND after 060.
-- Counts / flags only — no PII. Does not mutate data. Does not run 060.
--
-- Expectation before apply: schedule_revision / google_calendar_etag may be absent.
-- Expectation after apply: both present; schedule_revision NOT NULL with uuid default.

with cols as (
  select
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'coaching_bookings'
        and column_name = 'schedule_revision'
    ) as has_schedule_revision,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'coaching_bookings'
        and column_name = 'google_calendar_etag'
    ) as has_google_calendar_etag
)
select
  '060_schedule_revision_column'::text as check_name,
  case when has_schedule_revision then 'PRESENT' else 'ABSENT' end as status,
  'coaching_bookings.schedule_revision'::text as details
from cols

union all

select
  '060_google_calendar_etag_column'::text,
  case when has_google_calendar_etag then 'PRESENT' else 'ABSENT' end,
  'coaching_bookings.google_calendar_etag'::text
from cols

union all

select
  '060_bookings_row_count'::text,
  'INFO'::text,
  (select count(*)::text from public.coaching_bookings);

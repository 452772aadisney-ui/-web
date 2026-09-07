-- 057 precheck (read-only). Run before / if 057 aborts.
-- Counts only — no PII (no venue names, addresses, URLs, subjects).

select 'time_out_of_range_or_off_grid'::text as check_name,
  count(*)::int as row_count
from public.class_schedule_sessions s
where
  s.start_time < time '08:00'
  or s.start_time >= time '23:00'
  or s.end_time <= time '08:00'
  or s.end_time > time '23:00'
  or s.end_time <= s.start_time
  or (extract(epoch from s.start_time)::bigint % 300) <> 0
  or (extract(epoch from s.end_time)::bigint % 300) <> 0

union all

select 'subject_invalid',
  count(*)::int
from public.class_schedule_sessions s
where
  char_length(trim(s.subject)) = 0
  or char_length(trim(s.subject)) > 100
  or s.subject ~ '[[:cntrl:]]'

union all

select 'days_with_legacy_place_and_null_location_details',
  count(*)::int
from public.class_schedule_days d
where d.location_details is null
  and (
    nullif(trim(both from coalesce(d.address, '')), '') is not null
    or nullif(trim(both from coalesce(d.map_url, '')), '') is not null
    or nullif(trim(both from coalesce(d.room_note, '')), '') is not null
  )

union all

select 'days_total', count(*)::int from public.class_schedule_days
union all
select 'sessions_total', count(*)::int from public.class_schedule_sessions
union all
select 'notify_revision_sum', coalesce(sum(notify_revision), 0)::int
from public.class_schedule_days

order by check_name;

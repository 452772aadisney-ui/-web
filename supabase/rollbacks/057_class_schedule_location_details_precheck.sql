-- 057 precheck (READ-ONLY). Safe before AND after 057.
--
-- Does NOT reference location_details as a static column (avoids 42703 when
-- the column is absent). Uses to_jsonb(row) ->> 'location_details' instead:
--   * column missing  → key absent → NULL
--   * column present   → JSON text or NULL
--
-- Counts / flags only — no PII (no venue, address, URL, subject text).
-- Read-only SELECT only. Does not mutate data. Does not run 057.

with
col as (
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'class_schedule_days'
      and column_name = 'location_details'
  ) as location_details_present
),
days as (
  select
    d.*,
    nullif(
      trim(both from coalesce(to_jsonb(d) ->> 'location_details', '')),
      ''
    ) as location_details_norm,
    nullif(trim(both from coalesce(d.address, '')), '') as address_norm,
    nullif(trim(both from coalesce(d.map_url, '')), '') as map_url_norm,
    nullif(trim(both from coalesce(d.room_note, '')), '') as room_note_norm
  from public.class_schedule_days d
),
day_stats as (
  select
    count(*)::int as days_total,
    count(*) filter (where address_norm is not null)::int as days_with_address,
    count(*) filter (where map_url_norm is not null)::int as days_with_map_url,
    count(*) filter (where room_note_norm is not null)::int as days_with_room_note,
    count(*) filter (
      where location_details_norm is null
        and (
          address_norm is not null
          or map_url_norm is not null
          or room_note_norm is not null
        )
    )::int as days_backfill_candidates,
    count(*) filter (where location_details_norm is not null)::int
      as days_with_location_details_filled,
    coalesce(sum(notify_revision), 0)::bigint as notify_revision_sum,
    coalesce(min(notify_revision), 0)::int as notify_revision_min,
    coalesce(max(notify_revision), 0)::int as notify_revision_max
  from days
),
session_stats as (
  select
    count(*)::int as sessions_total,
    count(*) filter (
      where s.start_time < time '08:00'
        or s.start_time >= time '23:00'
        or s.end_time <= time '08:00'
        or s.end_time > time '23:00'
        or s.end_time <= s.start_time
    )::int as sessions_time_out_of_range,
    count(*) filter (
      where (extract(epoch from s.start_time)::bigint % 300) <> 0
        or (extract(epoch from s.end_time)::bigint % 300) <> 0
    )::int as sessions_off_five_minute_grid,
    count(*) filter (
      where extract(second from s.start_time) <> 0
        or extract(second from s.end_time) <> 0
    )::int as sessions_nonzero_seconds,
    count(*) filter (
      where char_length(trim(s.subject)) = 0
    )::int as sessions_blank_subject,
    count(*) filter (
      where char_length(trim(s.subject)) > 100
    )::int as sessions_subject_over_100,
    count(*) filter (
      where s.subject ~ '[[:cntrl:]]'
    )::int as sessions_subject_control_chars
  from public.class_schedule_sessions s
),
judgement as (
  select
    (select location_details_present from col) as location_details_present,
    d.days_total,
    s.sessions_total,
    d.days_with_address,
    d.days_with_map_url,
    d.days_with_room_note,
    d.days_backfill_candidates,
    -- When column is absent, filled count is always 0 (key missing → NULL).
    d.days_with_location_details_filled,
    s.sessions_time_out_of_range,
    s.sessions_off_five_minute_grid,
    s.sessions_nonzero_seconds,
    s.sessions_blank_subject,
    s.sessions_subject_over_100,
    s.sessions_subject_control_chars,
    d.notify_revision_sum,
    d.notify_revision_min,
    d.notify_revision_max,
    (
      s.sessions_time_out_of_range = 0
      and s.sessions_off_five_minute_grid = 0
      and s.sessions_nonzero_seconds = 0
      and s.sessions_blank_subject = 0
      and s.sessions_subject_over_100 = 0
      and s.sessions_subject_control_chars = 0
    ) as ready_for_057
  from day_stats d
  cross join session_stats s
)
select metric, value
from judgement
cross join lateral (
  values
    (
      'location_details_column_present',
      case when location_details_present then 1 else 0 end
    ),
    ('days_total', days_total),
    ('sessions_total', sessions_total),
    ('days_with_address', days_with_address),
    ('days_with_map_url', days_with_map_url),
    ('days_with_room_note', days_with_room_note),
    (
      'days_backfill_candidates',
      days_backfill_candidates
    ),
    (
      'days_with_location_details_filled',
      days_with_location_details_filled
    ),
    -- Interpret with location_details_column_present:
    --   present=0 → this value is always 0 (column absent, not "unknown")
    --   present=1 → count of non-empty location_details
    ('sessions_time_out_of_range', sessions_time_out_of_range),
    ('sessions_off_five_minute_grid', sessions_off_five_minute_grid),
    ('sessions_nonzero_seconds', sessions_nonzero_seconds),
    ('sessions_blank_subject', sessions_blank_subject),
    ('sessions_subject_over_100', sessions_subject_over_100),
    ('sessions_subject_control_chars', sessions_subject_control_chars),
    ('notify_revision_sum', notify_revision_sum::int),
    ('notify_revision_min', notify_revision_min),
    ('notify_revision_max', notify_revision_max),
    ('ready_for_057', case when ready_for_057 then 1 else 0 end)
) as v(metric, value)
order by
  case metric
    when 'location_details_column_present' then 1
    when 'days_total' then 2
    when 'sessions_total' then 3
    when 'days_with_address' then 4
    when 'days_with_map_url' then 5
    when 'days_with_room_note' then 6
    when 'days_backfill_candidates' then 7
    when 'days_with_location_details_filled' then 8
    when 'sessions_time_out_of_range' then 9
    when 'sessions_off_five_minute_grid' then 10
    when 'sessions_nonzero_seconds' then 11
    when 'sessions_blank_subject' then 12
    when 'sessions_subject_over_100' then 13
    when 'sessions_subject_control_chars' then 14
    when 'notify_revision_sum' then 15
    when 'notify_revision_min' then 16
    when 'notify_revision_max' then 17
    when 'ready_for_057' then 18
    else 99
  end;

-- 060 読み取り専用 verify（件数・列存在のみ、PIIなし）

with expected as (
  select unnest(array['schedule_revision', 'google_calendar_etag']) as column_name
),
existing as (
  select a.attname as column_name
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'coaching_bookings'
    and a.attnum > 0
    and not a.attisdropped
    and a.attname in (select column_name from expected)
)
select
  'coaching_bookings_schedule_revision_columns'::text as check_name,
  case
    when (select count(*) from expected) = (select count(*) from existing)
      then 'PASS'
    else 'FAIL'
  end as status,
  (
    select coalesce(string_agg(column_name, ',' order by column_name), '')
    from existing
  ) as details;

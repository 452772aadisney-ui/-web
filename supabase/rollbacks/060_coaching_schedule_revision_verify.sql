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
),
revision_nulls as (
  select count(*)::bigint as n
  from public.coaching_bookings
  where schedule_revision is null
),
revision_col as (
  select
    a.attnotnull as is_not_null,
    pg_get_expr(d.adbin, d.adrelid) as default_expr
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.nspname = 'public'
    and c.relname = 'coaching_bookings'
    and a.attname = 'schedule_revision'
    and a.attnum > 0
    and not a.attisdropped
)
select
  'coaching_bookings_schedule_revision_columns'::text as check_name,
  case
    when (select count(*) from expected) = (select count(*) from existing)
      and (select n from revision_nulls) = 0
      and coalesce((select is_not_null from revision_col), false)
      and coalesce((select default_expr from revision_col), '') ilike '%gen_random_uuid%'
      then 'PASS'
    else 'FAIL'
  end as status,
  format(
    'cols=%s null_revisions=%s not_null=%s has_uuid_default=%s',
    (select coalesce(string_agg(column_name, ',' order by column_name), '') from existing),
    (select n from revision_nulls),
    (select is_not_null from revision_col),
    (
      select coalesce((select default_expr from revision_col), '') ilike '%gen_random_uuid%'
    )
  ) as details;

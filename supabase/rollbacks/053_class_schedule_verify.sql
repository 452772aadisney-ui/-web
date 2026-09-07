-- 053_class_schedule 適用後の読み取り専用検証
-- Supabase Dashboard > SQL Editor で一括実行。DB を変更しません。

with
days_exists as (
  select exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname = 'class_schedule_days'
  ) as ok
),
sessions_exists as (
  select exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname = 'class_schedule_sessions'
  ) as ok
),
kisotsu_fn as (
  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_kisotsu_profile'
  ) as ok
),
days_cols as (
  select column_name
  from information_schema.columns
  where table_schema = 'public' and table_name = 'class_schedule_days'
),
sessions_cols as (
  select column_name
  from information_schema.columns
  where table_schema = 'public' and table_name = 'class_schedule_sessions'
),
days_policies as (
  select policyname, cmd
  from pg_policies
  where schemaname = 'public' and tablename = 'class_schedule_days'
),
sessions_policies as (
  select policyname, cmd
  from pg_policies
  where schemaname = 'public' and tablename = 'class_schedule_sessions'
),
days_unique as (
  select exists (
    select 1
    from pg_constraint
    where conname = 'class_schedule_days_schedule_date_unique'
  ) as ok
),
overlap_trigger as (
  select exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'class_schedule_sessions'
      and t.tgname = 'class_schedule_sessions_overlap_check'
      and not t.tgisinternal
  ) as ok
),
checks as (
  select
    'days_table_exists'::text as check_name,
    case when (select ok from days_exists) then 'PASS' else 'FAIL' end as status,
    '{}'::jsonb as details

  union all
  select
    'sessions_table_exists',
    case when (select ok from sessions_exists) then 'PASS' else 'FAIL' end,
    '{}'::jsonb

  union all
  select
    'is_kisotsu_profile_exists',
    case when (select ok from kisotsu_fn) then 'PASS' else 'FAIL' end,
    '{}'::jsonb

  union all
  select
    'days_required_columns',
    case
      when (
        select count(*) from days_cols
        where column_name in (
          'id', 'schedule_date', 'venue_name', 'address', 'map_url', 'room_note',
          'status', 'notify_revision', 'created_by', 'updated_by', 'created_at', 'updated_at'
        )
      ) = 12 then 'PASS' else 'FAIL'
    end,
    jsonb_build_object(
      'columns', coalesce((select jsonb_agg(column_name order by column_name) from days_cols), '[]'::jsonb)
    )

  union all
  select
    'sessions_required_columns',
    case
      when (
        select count(*) from sessions_cols
        where column_name in (
          'id', 'day_id', 'start_time', 'end_time', 'subject', 'note',
          'status', 'created_at', 'updated_at'
        )
      ) = 9 then 'PASS' else 'FAIL'
    end,
    jsonb_build_object(
      'columns', coalesce((select jsonb_agg(column_name order by column_name) from sessions_cols), '[]'::jsonb)
    )

  union all
  select
    'days_schedule_date_unique',
    case when (select ok from days_unique) then 'PASS' else 'FAIL' end,
    '{}'::jsonb

  union all
  select
    'days_select_policy',
    case
      when exists (
        select 1 from days_policies
        where policyname = 'class_schedule_days_select' and cmd = 'SELECT'
      ) then 'PASS' else 'FAIL'
    end,
    jsonb_build_object(
      'policies', coalesce((
        select jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd) order by policyname)
        from days_policies
      ), '[]'::jsonb)
    )

  union all
  select
    'sessions_select_policy',
    case
      when exists (
        select 1 from sessions_policies
        where policyname = 'class_schedule_sessions_select' and cmd = 'SELECT'
      ) then 'PASS' else 'FAIL'
    end,
    jsonb_build_object(
      'policies', coalesce((
        select jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd) order by policyname)
        from sessions_policies
      ), '[]'::jsonb)
    )

  union all
  select
    'sessions_overlap_trigger',
    case when (select ok from overlap_trigger) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
)
select check_name, status, details
from checks
order by check_name;

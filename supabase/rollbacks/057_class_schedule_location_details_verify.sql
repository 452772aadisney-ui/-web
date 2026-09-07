-- 057 verify (read-only). Expect all PASS after applying 057 (before 058).

with
fn as (
  select
    p.oid,
    oidvectortypes(p.proargtypes) as arg_types,
    p.prosecdef,
    coalesce(p.proconfig, array[]::text[]) as proconfig,
    pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_class_schedule_day_with_sessions'
),
cols as (
  select column_name, data_type, character_maximum_length
  from information_schema.columns
  where table_schema = 'public' and table_name = 'class_schedule_days'
),
session_checks as (
  select conname
  from pg_constraint
  where conrelid = 'public.class_schedule_sessions'::regclass
),
day_checks as (
  select conname
  from pg_constraint
  where conrelid = 'public.class_schedule_days'::regclass
),
backfill as (
  select
    count(*) filter (
      where location_details is null
        and (
          nullif(trim(both from coalesce(address, '')), '') is not null
          or nullif(trim(both from coalesce(map_url, '')), '') is not null
          or nullif(trim(both from coalesce(room_note, '')), '') is not null
        )
    )::int as legacy_unfilled,
    count(*) filter (
      where location_details is not null
        and (
          nullif(trim(both from coalesce(address, '')), '') is not null
          or nullif(trim(both from coalesce(map_url, '')), '') is not null
          or nullif(trim(both from coalesce(room_note, '')), '') is not null
        )
    )::int as legacy_filled,
    count(*)::int as days_total
  from public.class_schedule_days
),
bad_sessions as (
  select
    count(*) filter (
      where start_time < time '08:00'
        or start_time >= time '23:00'
        or end_time <= time '08:00'
        or end_time > time '23:00'
        or end_time <= start_time
        or (extract(epoch from start_time)::bigint % 300) <> 0
        or (extract(epoch from end_time)::bigint % 300) <> 0
    )::int as bad_time,
    count(*) filter (
      where char_length(trim(subject)) = 0
        or char_length(trim(subject)) > 100
        or subject ~ '[[:cntrl:]]'
    )::int as bad_subject
  from public.class_schedule_sessions
),
checks as (
  select 'location_details_column'::text as check_name,
    case when exists (
      select 1 from cols where column_name = 'location_details' and data_type = 'text'
    ) then 'PASS' else 'FAIL' end as status,
    '{}'::jsonb as detail
  union all
  select 'location_details_length_constraint',
    case when exists (
      select 1 from day_checks where conname = 'class_schedule_days_location_details_length'
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'legacy_columns_retained',
    case when exists (select 1 from cols where column_name = 'address')
      and exists (select 1 from cols where column_name = 'map_url')
      and exists (select 1 from cols where column_name = 'room_note')
    then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'backfill_no_legacy_left_null',
    case when (select legacy_unfilled from backfill) = 0
      then 'PASS' else 'FAIL' end,
    (select to_jsonb(backfill) from backfill)
  union all
  select 'create_rpc_dual_overloads',
    case when exists (
      select 1 from fn where arg_types = 'date, text, text, jsonb, uuid'
    ) and exists (
      select 1 from fn where arg_types = 'date, text, text, text, text, jsonb, uuid'
    ) and (select count(*) from fn) = 2
    then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'overloads', coalesce((select jsonb_agg(arg_types order by arg_types) from fn), '[]'::jsonb)
    )
  union all
  select 'create_rpc_5arg_service_role_only',
    case when
      has_function_privilege(
        'service_role',
        'public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        'public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid)',
        'EXECUTE'
      )
    then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'create_rpc_7arg_service_role_only',
    case when
      has_function_privilege(
        'service_role',
        'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid)',
        'EXECUTE'
      )
    then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'create_rpc_security_definer_search_path',
    case when (
      select count(*) from fn
      where prosecdef and proconfig @> array['search_path=public']
    ) = 2 then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'create_rpc_5arg_writes_location_details',
    case when exists (
      select 1 from fn
      where arg_types = 'date, text, text, jsonb, uuid'
        and def ilike '%p_location_details%'
        and def ilike '%location_details%'
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'create_rpc_7arg_sets_location_details',
    case when exists (
      select 1 from fn
      where arg_types = 'date, text, text, text, text, jsonb, uuid'
        and def ilike '%location_details%'
        and def ilike '%concat_ws%'
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'session_time_grid_constraint',
    case when exists (
      select 1 from session_checks where conname = 'class_schedule_sessions_time_grid'
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'session_subject_valid_constraint',
    case when exists (
      select 1 from session_checks where conname = 'class_schedule_sessions_subject_valid'
    ) then 'PASS' else 'FAIL' end,
    '{}'::jsonb
  union all
  select 'no_invalid_existing_sessions',
    case when (select bad_time + bad_subject from bad_sessions) = 0
      then 'PASS' else 'FAIL' end,
    (select to_jsonb(bad_sessions) from bad_sessions)
  union all
  select 'row_counts_and_notify_revision',
    'INFO',
    jsonb_build_object(
      'days', (select count(*)::int from public.class_schedule_days),
      'sessions', (select count(*)::int from public.class_schedule_sessions),
      'notify_revision_sum', (
        select coalesce(sum(notify_revision), 0)::bigint from public.class_schedule_days
      )
    )
)
select check_name, status, detail
from checks
order by check_name;

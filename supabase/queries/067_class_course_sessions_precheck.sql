-- 067 precheck (READ-ONLY). Safe before AND after 067.
-- Do not name not-yet-added columns on base tables in CASE arms that parse
-- against the live relation — use information_schema / to_regclass / to_jsonb.

select
  '067_depends_class_schedule_sessions'::text as check_name,
  case when to_regclass('public.class_schedule_sessions') is not null
    then 'PASS' else 'FAIL_APPLY_CLASS_SCHEDULE_FIRST' end as status,
  'class_schedule_sessions'::text as details

union all

select
  '067_depends_is_super_admin',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'is_super_admin'
  ) then 'PASS' else 'FAIL_APPLY_064_FIRST' end,
  'profiles.is_super_admin'

union all

select
  '067_class_course_units',
  case when to_regclass('public.class_course_units') is not null
    then 'PRESENT' else 'ABSENT' end,
  'expect ABSENT before apply'

union all

select
  '067_class_course_assignments',
  case when to_regclass('public.class_course_assignments') is not null
    then 'PRESENT' else 'ABSENT' end,
  'expect ABSENT before apply'

union all

select
  '067_session_attendees',
  case when to_regclass('public.class_schedule_session_attendees') is not null
    then 'PRESENT' else 'ABSENT' end,
  'expect ABSENT before apply'

union all

select
  '067_attendance_events',
  case when to_regclass('public.class_course_attendance_events') is not null
    then 'PRESENT' else 'ABSENT' end,
  'expect ABSENT before apply'

union all

select
  '067_sessions_course_unit_id',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'class_schedule_sessions'
      and column_name = 'course_unit_id'
  ) then 'PRESENT' else 'ABSENT' end,
  'expect ABSENT before apply'

union all

select
  '067_sessions_audience_type',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'class_schedule_sessions'
      and column_name = 'audience_type'
  ) then 'PRESENT' else 'ABSENT' end,
  'expect ABSENT before apply'

union all

select
  '067_create_units_rpc',
  case when exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_class_course_units_with_assignments'
  ) then 'PRESENT' else 'ABSENT' end,
  'expect ABSENT before apply'

union all

select
  '067_existing_sessions_count',
  'INFO',
  case when to_regclass('public.class_schedule_sessions') is null then 'table_absent'
  else (select count(*)::text from public.class_schedule_sessions)
  end;

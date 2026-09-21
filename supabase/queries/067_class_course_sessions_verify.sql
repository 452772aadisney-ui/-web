-- 067 verify (READ-ONLY). Expect all status = PASS after apply.

select
  'class_course_units'::text as check_name,
  case when to_regclass('public.class_course_units') is not null
    then 'PASS' else 'FAIL' end as status

union all
select
  'class_course_assignments',
  case when to_regclass('public.class_course_assignments') is not null
    then 'PASS' else 'FAIL' end

union all
select
  'class_schedule_session_attendees',
  case when to_regclass('public.class_schedule_session_attendees') is not null
    then 'PASS' else 'FAIL' end

union all
select
  'class_course_attendance_events',
  case when to_regclass('public.class_course_attendance_events') is not null
    then 'PASS' else 'FAIL' end

union all
select
  'sessions_course_unit_id',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'class_schedule_sessions'
      and column_name = 'course_unit_id'
  ) then 'PASS' else 'FAIL' end

union all
select
  'sessions_audience_type',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'class_schedule_sessions'
      and column_name = 'audience_type'
  ) then 'PASS' else 'FAIL' end

union all
select
  'legacy_sessions_default_all_kisotsu',
  case when (
    select count(*) from public.class_schedule_sessions s
    where coalesce(to_jsonb(s) ->> 'audience_type', '') is distinct from 'all_kisotsu'
      and to_jsonb(s) ->> 'course_unit_id' is null
  ) = 0 then 'PASS' else 'FAIL' end

union all
select
  'create_units_rpc',
  case when exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_class_course_units_with_assignments'
  ) then 'PASS' else 'FAIL' end

union all
select
  'add_students_rpc',
  case when exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'add_students_to_class_course_units'
  ) then 'PASS' else 'FAIL' end

union all
select
  'units_rls_enabled',
  case when exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'class_course_units' and c.relrowsecurity
  ) then 'PASS' else 'FAIL' end

union all
select
  'active_assignment_unique_index',
  case when exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'class_course_assignments_active_unique'
  ) then 'PASS' else 'FAIL' end;

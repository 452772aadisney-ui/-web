-- 070 verify (READ-ONLY). Expect all PASS after 070.

select
  '070_assignments_select_own_removed'::text as check_name,
  case when not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'class_course_assignments'
      and policyname = 'class_course_assignments_select_own'
  ) then 'PASS' else 'FAIL' end as status,
  'students must not select assignments'::text as details

union all

select
  '070_assignments_select_super_remains',
  case when exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'class_course_assignments'
      and policyname = 'class_course_assignments_select_super'
  ) then 'PASS' else 'FAIL' end,
  'super-only SELECT on assignments'

union all

select
  '070_attendance_events_no_student_select',
  case when not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'class_course_attendance_events'
      and policyname like '%_own%'
  ) then 'PASS' else 'FAIL' end,
  'no student own policy on attendance events'

union all

select
  '070_attendance_source_column',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'class_course_attendance_events'
      and column_name = 'source'
  ) then 'PASS' else 'FAIL' end,
  'source'

union all

select
  '070_record_attendance_rpc',
  case when to_regprocedure(
    'public.record_class_course_attendance(uuid,uuid,text,date,uuid,uuid)'
  ) is not null then 'PASS' else 'FAIL' end,
  'record_class_course_attendance'

union all

select
  '070_record_attendance_execute_service_role_only',
  case when exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'record_class_course_attendance'
      and has_function_privilege('service_role', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then 'PASS' else 'FAIL' end,
  'EXECUTE service_role only'

union all

select
  '070_remove_attendee_execute_service_role_only',
  case when exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'remove_class_schedule_session_attendee'
      and has_function_privilege('service_role', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then 'PASS' else 'FAIL' end,
  'remove attendee EXECUTE service_role only'

union all

select
  '070_students_still_select_own_attendees',
  case when exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'class_schedule_session_attendees'
      and policyname = 'class_schedule_session_attendees_select_own'
  ) then 'PASS' else 'FAIL' end,
  'session_attendees_select_own'
;

-- 070 precheck (READ-ONLY).

select
  '070_depends_067_assignments'::text as check_name,
  case when to_regclass('public.class_course_assignments') is not null
    then 'PASS' else 'FAIL_APPLY_067_FIRST' end as status,
  'class_course_assignments'::text as details

union all

select
  '070_depends_069_record_or_absent',
  case when to_regclass('public.class_course_attendance_events') is not null
    then 'PASS' else 'FAIL_APPLY_067_FIRST' end,
  'class_course_attendance_events'

union all

select
  '070_assignments_select_own_policy',
  case when exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'class_course_assignments'
      and policyname = 'class_course_assignments_select_own'
  ) then 'PRESENT' else 'ABSENT' end,
  'expect PRESENT before apply (dropped by 070)'

union all

select
  '070_attendance_source_column',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'class_course_attendance_events'
      and column_name = 'source'
  ) then 'PRESENT' else 'ABSENT' end,
  'expect ABSENT before apply'

union all

select
  '070_record_attendance_rpc',
  case when to_regprocedure(
    'public.record_class_course_attendance(uuid,uuid,text,date,uuid,uuid)'
  ) is not null then 'PRESENT' else 'ABSENT' end,
  'expect ABSENT before apply'
;

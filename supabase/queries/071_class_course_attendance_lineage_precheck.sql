-- 071 precheck (READ-ONLY).

select
  '071_depends_070_source'::text as check_name,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'class_course_attendance_events'
      and column_name = 'source'
  ) then 'PASS' else 'FAIL_APPLY_070_FIRST' end as status,
  'source column'::text as details

union all

select
  '071_lineage_column',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'class_course_attendance_events'
      and column_name = 'attendance_lineage_id'
  ) then 'PRESENT' else 'ABSENT' end,
  'expect ABSENT before apply'

union all

select
  '071_session_delete_trigger',
  case when exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'class_schedule_sessions'
      and t.tgname = 'class_schedule_sessions_deny_delete_with_attendance'
  ) then 'PRESENT' else 'ABSENT' end,
  'expect ABSENT before apply'

union all

select
  '071_record_rpc_6arg',
  case when to_regprocedure(
    'public.record_class_course_attendance(uuid,uuid,text,date,uuid,uuid)'
  ) is not null then 'PRESENT' else 'ABSENT' end,
  '070 6-arg; dropped by 071'

union all

select
  '071_record_rpc_7arg',
  case when to_regprocedure(
    'public.record_class_course_attendance(uuid,uuid,text,date,uuid,uuid,uuid)'
  ) is not null then 'PRESENT' else 'ABSENT' end,
  'expect ABSENT before apply'
;

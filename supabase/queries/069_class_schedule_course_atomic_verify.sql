-- 069 verify (READ-ONLY). Expect all PASS after 069 applied.

select
  '069_create_with_course_rpc'::text as check_name,
  case when to_regprocedure(
    'public.create_class_schedule_day_with_course_sessions(date,text,text,jsonb,uuid)'
  ) is not null then 'PASS' else 'FAIL' end as status,
  'create_class_schedule_day_with_course_sessions'::text as details

union all

select
  '069_add_with_course_rpc',
  case when to_regprocedure(
    'public.add_class_schedule_session_with_course(uuid,time,time,text,text,uuid,uuid[],uuid)'
  ) is not null then 'PASS' else 'FAIL' end,
  'add_class_schedule_session_with_course'

union all

select
  '069_update_with_course_rpc',
  case when to_regprocedure(
    'public.update_class_schedule_session_with_course(uuid,uuid,time,time,text,text,uuid,uuid[],boolean,uuid)'
  ) is not null then 'PASS' else 'FAIL' end,
  'update_class_schedule_session_with_course'

union all

select
  '069_course_unit_immutable_trigger',
  case when exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'class_schedule_sessions'
      and t.tgname = 'class_schedule_sessions_deny_course_unit_rebind'
      and not t.tgisinternal
  ) then 'PASS' else 'FAIL' end,
  'deny_course_unit_rebind'

union all

select
  '069_legacy_create_rpc_kept',
  case when to_regprocedure(
    'public.create_class_schedule_day_with_sessions(date,text,text,jsonb,uuid)'
  ) is not null then 'PASS' else 'FAIL' end,
  'create_class_schedule_day_with_sessions'

union all

select
  '069_attendance_deny_delete_trigger',
  case when exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'class_course_attendance_events'
      and t.tgname = 'class_course_attendance_events_deny_delete'
      and not t.tgisinternal
  ) then 'PASS' else 'FAIL' end,
  'deny_attendance_delete'
;

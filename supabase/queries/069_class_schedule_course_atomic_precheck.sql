-- 069 precheck (READ-ONLY). Safe before AND after 069.

select
  '069_depends_067_units'::text as check_name,
  case when to_regclass('public.class_course_units') is not null
    then 'PASS' else 'FAIL_APPLY_067_FIRST' end as status,
  'class_course_units'::text as details

union all

select
  '069_depends_068_remove_rpc',
  case when to_regprocedure(
    'public.remove_class_schedule_session_attendee(uuid,uuid,uuid)'
  ) is not null then 'PASS' else 'FAIL_APPLY_068_FIRST' end,
  'remove_class_schedule_session_attendee'

union all

select
  '069_create_with_course_rpc',
  case when to_regprocedure(
    'public.create_class_schedule_day_with_course_sessions(date,text,text,jsonb,uuid)'
  ) is not null then 'PRESENT' else 'ABSENT' end,
  'expect ABSENT before apply'

union all

select
  '069_add_with_course_rpc',
  case when to_regprocedure(
    'public.add_class_schedule_session_with_course(uuid,time,time,text,text,uuid,uuid[],uuid)'
  ) is not null then 'PRESENT' else 'ABSENT' end,
  'expect ABSENT before apply'

union all

select
  '069_update_with_course_rpc',
  case when to_regprocedure(
    'public.update_class_schedule_session_with_course(uuid,uuid,time,time,text,text,uuid,uuid[],boolean,uuid)'
  ) is not null then 'PRESENT' else 'ABSENT' end,
  'expect ABSENT before apply'

union all

select
  '069_legacy_create_rpc_still_present',
  case when to_regprocedure(
    'public.create_class_schedule_day_with_sessions(date,text,text,jsonb,uuid)'
  ) is not null then 'PASS' else 'FAIL_LEGACY_CREATE_MISSING' end,
  'old create RPC must remain for freeform/old apps'
;

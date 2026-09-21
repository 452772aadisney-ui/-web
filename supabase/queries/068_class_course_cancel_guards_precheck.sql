-- 068 precheck (READ-ONLY). Safe before AND after 068.

select
  '068_depends_067_units'::text as check_name,
  case when to_regclass('public.class_course_units') is not null
    then 'PASS' else 'FAIL_APPLY_067_FIRST' end as status,
  'class_course_units'::text as details

union all

select
  '068_depends_067_attendees',
  case when to_regclass('public.class_schedule_session_attendees') is not null
    then 'PASS' else 'FAIL_APPLY_067_FIRST' end,
  'class_schedule_session_attendees'

union all

select
  '068_remove_attendee_rpc',
  case when to_regprocedure(
    'public.remove_class_schedule_session_attendee(uuid,uuid,uuid)'
  ) is not null then 'PRESENT' else 'ABSENT' end,
  'remove_class_schedule_session_attendee'

union all

select
  '068_cancel_assignment_rpc',
  case when to_regprocedure(
    'public.cancel_class_course_assignment(uuid,uuid,uuid)'
  ) is not null then 'PRESENT' else 'ABSENT' end,
  'cancel_class_course_assignment'
;

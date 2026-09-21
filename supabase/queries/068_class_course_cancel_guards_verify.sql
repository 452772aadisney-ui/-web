-- 068 verify (READ-ONLY). Expect all PASS after 068 applied.

select
  '068_remove_attendee_rpc'::text as check_name,
  case when to_regprocedure(
    'public.remove_class_schedule_session_attendee(uuid,uuid,uuid)'
  ) is not null then 'PASS' else 'FAIL' end as status,
  'remove_class_schedule_session_attendee'::text as details

union all

select
  '068_cancel_assignment_rpc',
  case when to_regprocedure(
    'public.cancel_class_course_assignment(uuid,uuid,uuid)'
  ) is not null then 'PASS' else 'FAIL' end,
  'cancel_class_course_assignment'

union all

select
  '068_attendee_delete_trigger',
  case when exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'class_schedule_session_attendees'
      and t.tgname = 'class_schedule_session_attendees_deny_delete_with_record'
      and not t.tgisinternal
  ) then 'PASS' else 'FAIL' end,
  'deny_delete_with_record'
;

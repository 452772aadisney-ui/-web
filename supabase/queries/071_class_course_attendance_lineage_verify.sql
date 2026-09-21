-- 071 verify (READ-ONLY). Expect all PASS after 071.

select
  '071_lineage_column'::text as check_name,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'class_course_attendance_events'
      and column_name = 'attendance_lineage_id'
      and is_nullable = 'NO'
  ) then 'PASS' else 'FAIL' end as status,
  'attendance_lineage_id NOT NULL'::text as details

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
      and not t.tgisinternal
  ) then 'PASS' else 'FAIL' end,
  'deny delete with attendance'

union all

select
  '071_record_rpc_7arg_only',
  case when to_regprocedure(
    'public.record_class_course_attendance(uuid,uuid,text,date,uuid,uuid,uuid)'
  ) is not null
    and to_regprocedure(
      'public.record_class_course_attendance(uuid,uuid,text,date,uuid,uuid)'
    ) is null
  then 'PASS' else 'FAIL' end,
  '7-arg present, 6-arg dropped'

union all

select
  '071_record_execute_service_role_only',
  case when exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'record_class_course_attendance'
      and pg_get_function_identity_arguments(p.oid) =
        'p_course_unit_id uuid, p_student_id uuid, p_status text, p_event_date date, p_session_id uuid, p_attendance_lineage_id uuid, p_actor_id uuid'
      and has_function_privilege('service_role', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then 'PASS' else 'FAIL' end,
  'EXECUTE service_role only'
;

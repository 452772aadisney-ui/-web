-- 071 適用後の最終状態チェック（READ-ONLY）。
-- 067→071 を順に適用し、各 verify が PASS したあとに実行する。
-- 1 行でも FAIL / 想定外なら停止。書き込み・デプロイ・通知確認は別途承認後。

select
  'final_assignments_select_own_absent'::text as check_name,
  case when not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'class_course_assignments'
      and policyname = 'class_course_assignments_select_own'
  ) then 'PASS' else 'FAIL' end as status,
  'student must not SELECT assignments'::text as details

union all

select
  'final_assignments_select_super',
  case when exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'class_course_assignments'
      and policyname = 'class_course_assignments_select_super'
  ) then 'PASS' else 'FAIL' end,
  'super SELECT remains'

union all

select
  'final_attendees_select_own',
  case when exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'class_schedule_session_attendees'
      and policyname = 'class_schedule_session_attendees_select_own'
  ) then 'PASS' else 'FAIL' end,
  'student targeting SELECT'

union all

select
  'final_attendance_no_own_policy',
  case when not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'class_course_attendance_events'
      and policyname like '%_own%'
  ) then 'PASS' else 'FAIL' end,
  'no student attendance SELECT'

union all

select
  'final_source_and_lineage_not_null',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'class_course_attendance_events'
      and column_name = 'source'
      and is_nullable = 'NO'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'class_course_attendance_events'
      and column_name = 'attendance_lineage_id'
      and is_nullable = 'NO'
  ) then 'PASS' else 'FAIL' end,
  'source + attendance_lineage_id'

union all

select
  'final_record_rpc_7arg_only',
  case when to_regprocedure(
    'public.record_class_course_attendance(uuid,uuid,text,date,uuid,uuid,uuid)'
  ) is not null
    and to_regprocedure(
      'public.record_class_course_attendance(uuid,uuid,text,date,uuid,uuid)'
    ) is null
  then 'PASS' else 'FAIL' end,
  '6-arg must be gone after 071'

union all

select
  'final_record_execute_service_role_only',
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
  'record EXECUTE'

union all

select
  'final_remove_execute_service_role_only',
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
  'remove EXECUTE'

union all

select
  'final_cancel_execute_service_role_only',
  case when exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'cancel_class_course_assignment'
      and has_function_privilege('service_role', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then 'PASS' else 'FAIL' end,
  'cancel EXECUTE'

union all

select
  'final_create_course_day_rpc',
  case when to_regprocedure(
    'public.create_class_schedule_day_with_course_sessions(date,text,text,jsonb,uuid)'
  ) is not null then 'PASS' else 'FAIL' end,
  '069 create'

union all

select
  'final_legacy_create_kept',
  case when to_regprocedure(
    'public.create_class_schedule_day_with_sessions(date,text,text,jsonb,uuid)'
  ) is not null then 'PASS' else 'FAIL' end,
  'legacy freeform create (intentional)'

union all

select
  'final_session_delete_attendance_trigger',
  case when exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'class_schedule_sessions'
      and t.tgname = 'class_schedule_sessions_deny_delete_with_attendance'
      and not t.tgisinternal
  ) then 'PASS' else 'FAIL' end,
  '071 delete guard'

union all

select
  'final_attendee_delete_trigger',
  case when exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'class_schedule_session_attendees'
      and t.tgname = 'class_schedule_session_attendees_deny_delete_with_record'
      and not t.tgisinternal
  ) then 'PASS' else 'FAIL' end,
  '068/071 attendee guard'

union all

select
  'final_attendance_deny_delete_trigger',
  case when exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'class_course_attendance_events'
      and t.tgname = 'class_course_attendance_events_deny_delete'
      and not t.tgisinternal
  ) then 'PASS' else 'FAIL' end,
  'append-only history'

union all

select
  'final_course_unit_rebind_trigger',
  case when exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'class_schedule_sessions'
      and t.tgname = 'class_schedule_sessions_deny_course_unit_rebind'
      and not t.tgisinternal
  ) then 'PASS' else 'FAIL' end,
  'rebind guard (softened in 070 body)'
;

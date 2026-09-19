-- 066 読み取り専用 verify（適用後）
-- Expect all status = PASS.

with checks as (
  select
    'comment_at_read_column'::text as check_name,
    case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'study_day_feedback_reads'
        and column_name = 'comment_at_read'
    ) then 'PASS' else 'FAIL' end as status
  union all
  select
    'last_super_delete_trigger',
    case when exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'profiles'
        and t.tgname = 'profiles_protect_last_super_delete'
        and not t.tgisinternal
    ) then 'PASS' else 'FAIL' end
  union all
  select
    'message_kind_allows_service_role',
    case when exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'enforce_chat_message_kind_on_write'
        and pg_get_functiondef(p.oid) ilike '%service_role%'
    ) then 'PASS' else 'FAIL' end
  union all
  select
    'set_admin_super_uses_advisory_lock',
    case when exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'set_admin_super_privilege'
        and pg_get_functiondef(p.oid) ilike '%pg_advisory_xact_lock%'
    ) then 'PASS' else 'FAIL' end
  union all
  -- Stale broad policies: bare is_admin without graduate helpers on scoped tables
  select
    'no_stale_broad_admin_on_scoped_tables',
    case when count(*) = 0 then 'PASS' else 'FAIL' end
  from pg_policies
  where schemaname = 'public'
    and tablename = any (array[
      'study_logs','chat_messages','study_day_feedback','student_achievements',
      'coaching_bookings','coaching_karte_entries','textbooks','quiz_results',
      'quiz_assignment_students','profile_student_tags','student_page_visits',
      'announcement_reads','study_day_feedback_reads',
      'announcement_target_students','exam_schedule_students',
      'homework_task_students','application_task_students'
    ])
    and (
      coalesce(qual, '') ~* 'is_admin\s*\('
      or coalesce(with_check, '') ~* 'is_admin\s*\('
    )
    and coalesce(qual, '') !~* 'admin_can_access_student'
    and coalesce(with_check, '') !~* 'admin_can_access_student'
    and coalesce(qual, '') !~* 'admin_can_manage_announcement'
    and coalesce(with_check, '') !~* 'admin_can_manage_announcement'
    and coalesce(qual, '') !~* 'is_super_admin'
    and coalesce(with_check, '') !~* 'is_super_admin'
  union all
  select
    'application_tasks_catalog_not_student_scoped',
    case when not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'application_tasks'
        and (
          coalesce(qual, '') ilike '%student_id%'
          or coalesce(with_check, '') ilike '%student_id%'
        )
    ) then 'PASS' else 'FAIL' end
  union all
  select
    'announcement_target_students_not_world_readable',
    case when not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'announcement_target_students'
        and cmd = 'SELECT'
        and coalesce(qual, '') in ('true', '(true)')
    ) then 'PASS' else 'FAIL' end
)
select * from checks
order by case status when 'FAIL' then 0 else 1 end, check_name;

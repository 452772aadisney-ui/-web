-- Isolation harness for disposable / local Supabase (NOT production).
-- Run after 064–066 + bootstrap of ONE explicit super admin UUID in that DB only.
-- Replace role JWTs via Dashboard SQL: set request.jwt.claim.sub / role as needed,
-- or use the Supabase SQL editor while signed in as each test user.
--
-- Do not paste real production UUIDs into tickets. Use disposable test ids only.
--
-- Expected (after 066):
-- A) anon: cannot insert profile_student_tags
-- B) regular admin: cannot select kisotsu student profile / study_logs
-- C) super admin: can select kisotsu student
-- D) enrolled student: can select own study_logs
-- E) kisotsu student: can select class_schedule_days
-- F) regular admin: cannot select class_schedule_days
-- G) last super demote / delete raises

-- --- A) Policy inventory smoke (always safe, read-only) ---
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles','study_logs','chat_messages','announcement_reads',
    'announcement_target_students','class_schedule_days','application_tasks',
    'application_task_students','study_day_feedback_reads'
  )
order by tablename, cmd, policyname;

-- --- B) Helper EXECUTE grants: anon must not run privilege helpers ---
select p.proname, r.rolname, a.privilege_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a on true
left join pg_roles r on r.oid = a.grantee
where n.nspname = 'public'
  and p.proname in (
    'is_super_admin','admin_can_access_student','set_admin_super_privilege',
    'admin_can_manage_announcement'
  )
  and r.rolname = 'anon';
-- Expect: 0 rows

-- --- C) Manual session checks (run as each JWT; sketch only) ---
-- as regular admin:
--   select id from profiles where role = 'student'; -- must exclude kisotsu
--   select count(*) from class_schedule_days; -- 0
-- as super:
--   select count(*) from class_schedule_days; -- >= 0 visible
-- as kisotsu student:
--   select count(*) from class_schedule_days; -- visible
-- try demote last super via set_admin_super_privilege → exception
-- try delete last super profile → exception

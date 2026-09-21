-- Isolation harness for disposable / local Supabase ONLY.
-- Do NOT run against production. Do NOT paste production UUIDs into tickets.
--
-- STATUS: verification template. Real-DB execution = 未実施 until an isolation
-- project fills isolation_harness_ids and observes PASS notices for A–H.
--
-- CRITICAL: SQL Editor as `postgres` / `supabase_admin` BYPASSES RLS.
-- Section 0 under postgres proves policy inventory only — not access control.
-- Every access-control assertion MUST:
--   1) set request.jwt.claim.sub (+ role claim)
--   2) SET LOCAL ROLE authenticated | anon
--   3) assert while current_user is NOT postgres/supabase_admin
--   4) RESET ROLE before the next identity
--
-- Concurrent demote (G2) requires TWO independent SQL connections.
--
-- Prerequisites (isolation DB only):
-- 1) Apply migrations through 066
-- 2) Bootstrap ONE super admin (docs/admin-super-privilege-rollout.md)
-- 3) Create disposable users; fill the temp table in SETUP below
-- 4) Optional: set_config('app.isolation_harness_ok','1',false) then enable guard

-- =============================================================================
-- SETUP — fill disposable UUIDs (required before A–H)
-- =============================================================================
drop table if exists isolation_harness_ids;
create temporary table isolation_harness_ids (
  super_id uuid not null,
  super_b_id uuid, -- second super for G2 only; null skips concurrent section notes
  regular_admin_id uuid not null,
  enrolled_id uuid not null,
  kisotsu_id uuid not null,
  legacy_all_announcement_id uuid not null
);

-- REPLACE each value with isolation-only UUIDs, then uncomment:
-- insert into isolation_harness_ids (
--   super_id, super_b_id, regular_admin_id, enrolled_id, kisotsu_id,
--   legacy_all_announcement_id
-- ) values (
--   '00000000-0000-0000-0000-000000000001',
--   '00000000-0000-0000-0000-000000000002',
--   '00000000-0000-0000-0000-000000000003',
--   '00000000-0000-0000-0000-000000000004',
--   '00000000-0000-0000-0000-000000000005',
--   '00000000-0000-0000-0000-000000000006'
-- );

-- Optional production guard (enable on isolation DB only):
-- do $$
-- begin
--   if current_setting('app.isolation_harness_ok', true) is distinct from '1' then
--     raise exception 'harness blocked: set app.isolation_harness_ok=1 on isolation DB only';
--   end if;
-- end $$;

create or replace function pg_temp.isolation_require_ids()
returns isolation_harness_ids
language plpgsql
as $$
declare
  row isolation_harness_ids;
begin
  select * into row from isolation_harness_ids limit 1;
  if not found then
    raise exception 'harness aborted: insert into isolation_harness_ids first (isolation DB only)';
  end if;
  return row;
end;
$$;

create or replace function pg_temp.isolation_require_non_elevated()
returns void
language plpgsql
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    raise exception 'FAIL: still elevated role % — SET LOCAL ROLE authenticated|anon first', current_user;
  end if;
end;
$$;

-- =============================================================================
-- 0) Inventory (postgres OK — does NOT prove RLS)
-- =============================================================================
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles','study_logs','chat_messages','announcement_reads',
    'announcement_target_students','announcements','class_schedule_days',
    'application_task_students','study_day_feedback_reads'
  )
order by tablename, cmd, policyname;

-- =============================================================================
-- A) anon: cannot read student study_logs (and INSERT tags should deny)
-- =============================================================================
begin;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select pg_temp.isolation_require_non_elevated();

do $$
declare
  n bigint;
begin
  select count(*) into n from public.study_logs;
  if n <> 0 then
    raise exception 'FAIL A: anon saw study_logs count=%', n;
  end if;
  raise notice 'PASS A: anon study_logs empty';
exception
  when insufficient_privilege then
    raise notice 'PASS A: anon study_logs permission denied';
end $$;

-- Optional probe (expect ERROR):
-- insert into public.profile_student_tags (profile_id, tag_id)
-- values (
--   (pg_temp.isolation_require_ids()).kisotsu_id,
--   '00000000-0000-0000-0000-000000000099'
-- );

reset role;
rollback;

-- =============================================================================
-- B) regular admin: kisotsu SELECT/UPDATE denied; all-announcements blocked
-- =============================================================================
begin;
select set_config(
  'request.jwt.claim.sub',
  (pg_temp.isolation_require_ids()).regular_admin_id::text,
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select pg_temp.isolation_require_non_elevated();

do $$
declare
  ids isolation_harness_ids;
  n bigint;
  updated_count integer;
begin
  ids := pg_temp.isolation_require_ids();

  select count(*) into n from public.profiles where id = ids.kisotsu_id;
  if n <> 0 then
    raise exception 'FAIL B1: regular admin SELECT kisotsu profile rows=%', n;
  end if;
  raise notice 'PASS B1: regular admin cannot SELECT kisotsu profile';

  select count(*) into n from public.study_logs where student_id = ids.kisotsu_id;
  if n <> 0 then
    raise exception 'FAIL B2: regular admin SELECT kisotsu study_logs rows=%', n;
  end if;
  raise notice 'PASS B2: regular admin cannot SELECT kisotsu study_logs';

  update public.profiles
  set display_name = display_name
  where id = ids.kisotsu_id;
  get diagnostics updated_count = row_count;
  if updated_count <> 0 then
    raise exception 'FAIL B3: regular admin UPDATE kisotsu affected=%', updated_count;
  end if;
  raise notice 'PASS B3: regular admin UPDATE kisotsu denied (0 rows)';

  select count(*) into n from public.class_schedule_days;
  if n <> 0 then
    raise exception 'FAIL B4: regular admin saw class_schedule_days count=%', n;
  end if;
  raise notice 'PASS B4: regular admin class_schedule_days empty';

  select count(*) into n
  from public.announcements
  where audience_scope = 'all' or target_all = true;
  if n <> 0 then
    raise exception 'FAIL B5: regular admin saw all/mixed announcements count=%', n;
  end if;
  raise notice 'PASS B5: regular admin cannot see all/mixed announcements';

  update public.announcements
  set title = title
  where id = ids.legacy_all_announcement_id;
  get diagnostics updated_count = row_count;
  if updated_count <> 0 then
    raise exception 'FAIL B6: regular admin UPDATE all-announcement affected=%', updated_count;
  end if;
  raise notice 'PASS B6: regular admin UPDATE all-announcement denied';
end $$;

reset role;
rollback;

-- =============================================================================
-- C) super admin: kisotsu + class schedule allowed
-- =============================================================================
begin;
select set_config(
  'request.jwt.claim.sub',
  (pg_temp.isolation_require_ids()).super_id::text,
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select pg_temp.isolation_require_non_elevated();

do $$
declare
  ids isolation_harness_ids;
  n bigint;
begin
  ids := pg_temp.isolation_require_ids();

  select count(*) into n from public.profiles where id = ids.kisotsu_id;
  if n < 1 then
    raise exception 'FAIL C1: super cannot SELECT kisotsu profile';
  end if;
  raise notice 'PASS C1: super SELECT kisotsu profile';

  perform 1 from public.study_logs where student_id = ids.kisotsu_id;
  raise notice 'PASS C2: super can query kisotsu study_logs';

  select count(*) into n from public.class_schedule_days;
  raise notice 'PASS C3: super class_schedule_days readable (count=%)', n;
end $$;

reset role;
rollback;

-- =============================================================================
-- D) enrolled student: no kisotsu logs; no class schedule
-- =============================================================================
begin;
select set_config(
  'request.jwt.claim.sub',
  (pg_temp.isolation_require_ids()).enrolled_id::text,
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select pg_temp.isolation_require_non_elevated();

do $$
declare
  ids isolation_harness_ids;
  n bigint;
begin
  ids := pg_temp.isolation_require_ids();

  select count(*) into n from public.study_logs where student_id = ids.kisotsu_id;
  if n <> 0 then
    raise exception 'FAIL D1: enrolled student saw kisotsu logs';
  end if;
  raise notice 'PASS D1: enrolled cannot see kisotsu study_logs';

  select count(*) into n from public.class_schedule_days;
  if n <> 0 then
    raise exception 'FAIL D2: enrolled saw class_schedule_days count=%', n;
  end if;
  raise notice 'PASS D2: enrolled class_schedule_days empty';
end $$;

reset role;
rollback;

-- =============================================================================
-- E) kisotsu student: class schedule OK; other students' logs denied
-- =============================================================================
begin;
select set_config(
  'request.jwt.claim.sub',
  (pg_temp.isolation_require_ids()).kisotsu_id::text,
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select pg_temp.isolation_require_non_elevated();

do $$
declare
  ids isolation_harness_ids;
  n bigint;
begin
  ids := pg_temp.isolation_require_ids();

  select count(*) into n from public.study_logs where student_id = ids.enrolled_id;
  if n <> 0 then
    raise exception 'FAIL E1: kisotsu saw enrolled study_logs';
  end if;
  raise notice 'PASS E1: kisotsu cannot see enrolled study_logs';

  select count(*) into n from public.class_schedule_days;
  raise notice 'PASS E2: kisotsu class_schedule_days readable (count=%)', n;
end $$;

reset role;
rollback;

-- =============================================================================
-- F) elevated session: service_role / postgres message_kind preservation
--     Intentionally elevated (RLS bypass). Delete the probe row afterwards.
-- =============================================================================
-- insert into public.chat_messages (
--   student_id, sender_id, body, message_kind
-- ) values (
--   (select enrolled_id from isolation_harness_ids),
--   (select super_id from isolation_harness_ids),
--   'isolation harness booking prompt',
--   'coaching_booking_reminder'
-- )
-- returning id, message_kind;
-- Expect: message_kind = 'coaching_booking_reminder' (NOT forced to 'user')
--
-- Then as enrolled JWT + SET LOCAL ROLE authenticated, insert system kind and
-- expect forced 'user' or RLS reject.

-- =============================================================================
-- G1) last super demote / delete denied (authenticated JWT = sole super)
-- =============================================================================
begin;
select set_config(
  'request.jwt.claim.sub',
  (pg_temp.isolation_require_ids()).super_id::text,
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select pg_temp.isolation_require_non_elevated();

do $$
declare
  ids isolation_harness_ids;
begin
  ids := pg_temp.isolation_require_ids();

  begin
    perform public.set_admin_super_privilege(ids.super_id, false);
    raise exception 'FAIL G1a: last-super demote succeeded';
  exception
    when others then
      if sqlerrm ~* 'FAIL G1a' then raise; end if;
      raise notice 'PASS G1a: demote blocked: %', sqlerrm;
  end;

  begin
    delete from public.profiles where id = ids.super_id;
    if found then
      raise exception 'FAIL G1b: last-super DELETE succeeded';
    end if;
    raise notice 'PASS G1b: delete affected 0 rows under RLS';
  exception
    when others then
      if sqlerrm ~* 'FAIL G1b' then raise; end if;
      raise notice 'PASS G1b: delete blocked: %', sqlerrm;
  end;
end $$;

reset role;
-- After reset (elevated), confirm row still super if probes used commit:
-- select id, is_super_admin from public.profiles
-- where id = (select super_id from isolation_harness_ids);
rollback;

-- =============================================================================
-- G2) concurrent demote — TWO independent connections (not one session)
-- =============================================================================
-- Need two supers (super_id and super_b_id both is_super_admin=true).
--
-- Connection 1:
--   begin;
--   select set_config('request.jwt.claim.sub', (select super_id::text from isolation_harness_ids), true);
--   select set_config('request.jwt.claim.role', 'authenticated', true);
--   set local role authenticated;
--   select public.set_admin_super_privilege(
--     (select super_b_id from isolation_harness_ids), false);
--   -- keep txn open
--
-- Connection 2 (separate session; recreate temp ids or use literals):
--   begin;
--   select set_config('request.jwt.claim.sub', '<super_b_id>', true);
--   select set_config('request.jwt.claim.role', 'authenticated', true);
--   set local role authenticated;
--   select public.set_admin_super_privilege('<super_id>', false);
--   commit;
--
-- Then commit Connection 1.
-- Expect: at least one fails OR final super count >= 1:
--   select count(*) from public.profiles where role='admin' and is_super_admin;

-- =============================================================================
-- H) covered by B5/B6 (all / mixed announcement manage blocked for regular admin)
-- =============================================================================

-- Done: RESET ROLE; drop probe rows; never leave protect triggers disabled.
-- Real-DB status remains 未実施 until PASS notices are observed on isolation DB.

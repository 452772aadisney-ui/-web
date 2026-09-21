-- 067: 既卒授業回数（共通授業・割当・コマ対象・実施履歴）
-- Supabase Dashboard > SQL Editor で実行。本番はこのチャットから自動実行しない。
--
-- 依存: 053–058 class_schedule, 064 is_super_admin / is_kisotsu_student,
--       065 class_schedule RLS（大管理者書込）, profiles
-- 非破壊: 既存 class_schedule_* 行は course_unit_id NULL・全員向けのまま。
-- ロールアウト: docs/class-course-sessions-rollout.md

-- =============================================================================
-- 1) class_course_units（共通授業）
-- =============================================================================

create table if not exists public.class_course_units (
  id uuid primary key default gen_random_uuid(),
  academic_year integer not null
    check (academic_year >= 2000 and academic_year <= 2100),
  term text not null
    check (term in (
      'spring', 'first_half', 'summer', 'second_half', 'winter', 'pre_exam'
    )),
  subject text not null
    check (subject in (
      'english_grammar', 'english_reading', 'math_iaiibc',
      'math_iii', 'physics', 'japanese'
    )),
  track text not null
    check (track in ('regular', 'addon')),
  seq_no integer not null
    check (seq_no >= 1 and seq_no <= 99),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_course_units_scope_seq_unique
    unique (academic_year, term, subject, track, seq_no)
);

comment on table public.class_course_units is
  '既卒向け共通授業（年度×時期×科目×通常/追加枠×番号）。受講者0でも番号は維持。';

create index if not exists class_course_units_scope_idx
  on public.class_course_units (academic_year, term, subject, track, seq_no);

drop trigger if exists class_course_units_updated_at on public.class_course_units;
create trigger class_course_units_updated_at
  before update on public.class_course_units
  for each row execute function public.handle_updated_at();

alter table public.class_course_units enable row level security;

drop policy if exists "class_course_units_select_super" on public.class_course_units;
create policy "class_course_units_select_super"
  on public.class_course_units for select to authenticated
  using (public.is_super_admin());

drop policy if exists "class_course_units_insert_super" on public.class_course_units;
create policy "class_course_units_insert_super"
  on public.class_course_units for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists "class_course_units_update_super" on public.class_course_units;
create policy "class_course_units_update_super"
  on public.class_course_units for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "class_course_units_delete_super" on public.class_course_units;
create policy "class_course_units_delete_super"
  on public.class_course_units for delete to authenticated
  using (public.is_super_admin());

grant select, insert, update, delete on public.class_course_units to authenticated;

-- =============================================================================
-- 2) class_course_assignments（生徒への割当）
-- =============================================================================

create table if not exists public.class_course_assignments (
  id uuid primary key default gen_random_uuid(),
  course_unit_id uuid not null
    references public.class_course_units (id) on delete restrict,
  student_id uuid not null
    references public.profiles (id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'cancelled')),
  cancelled_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_course_assignments_cancel_consistency
    check (
      (status = 'active' and cancelled_at is null)
      or (status = 'cancelled' and cancelled_at is not null)
    )
);

comment on table public.class_course_assignments is
  '共通授業への生徒割当。二重active禁止。取消は物理削除せず cancelled。';

-- 同一生徒・同一授業の active は1件のみ
create unique index if not exists class_course_assignments_active_unique
  on public.class_course_assignments (course_unit_id, student_id)
  where status = 'active';

create index if not exists class_course_assignments_student_idx
  on public.class_course_assignments (student_id, status);

create index if not exists class_course_assignments_unit_idx
  on public.class_course_assignments (course_unit_id, status);

drop trigger if exists class_course_assignments_updated_at on public.class_course_assignments;
create trigger class_course_assignments_updated_at
  before update on public.class_course_assignments
  for each row execute function public.handle_updated_at();

alter table public.class_course_assignments enable row level security;

drop policy if exists "class_course_assignments_select_super" on public.class_course_assignments;
create policy "class_course_assignments_select_super"
  on public.class_course_assignments for select to authenticated
  using (public.is_super_admin());

-- 生徒は自分の active 割当のみ参照（対象コマ判定用。他生徒は不可）
drop policy if exists "class_course_assignments_select_own" on public.class_course_assignments;
create policy "class_course_assignments_select_own"
  on public.class_course_assignments for select to authenticated
  using (
    student_id = auth.uid()
    and status = 'active'
    and public.is_kisotsu_profile()
  );

drop policy if exists "class_course_assignments_insert_super" on public.class_course_assignments;
create policy "class_course_assignments_insert_super"
  on public.class_course_assignments for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists "class_course_assignments_update_super" on public.class_course_assignments;
create policy "class_course_assignments_update_super"
  on public.class_course_assignments for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "class_course_assignments_delete_super" on public.class_course_assignments;
create policy "class_course_assignments_delete_super"
  on public.class_course_assignments for delete to authenticated
  using (public.is_super_admin());

grant select, insert, update, delete on public.class_course_assignments to authenticated;

-- =============================================================================
-- 3) class_schedule_sessions 拡張
-- =============================================================================

alter table public.class_schedule_sessions
  add column if not exists course_unit_id uuid
    references public.class_course_units (id) on delete restrict;

alter table public.class_schedule_sessions
  add column if not exists audience_type text;

-- 既存行・自由記述の既定: 全員向け
update public.class_schedule_sessions
set audience_type = 'all_kisotsu'
where audience_type is null;

alter table public.class_schedule_sessions
  alter column audience_type set default 'all_kisotsu';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'class_schedule_sessions_audience_type_check'
  ) then
    alter table public.class_schedule_sessions
      add constraint class_schedule_sessions_audience_type_check
      check (audience_type in ('all_kisotsu', 'targeted'));
  end if;
end $$;

alter table public.class_schedule_sessions
  alter column audience_type set not null;

comment on column public.class_schedule_sessions.course_unit_id is
  '共通授業ID。NULL=自由記述コマ（回数管理外）。識別・集計はID。subjectは表示用。';
comment on column public.class_schedule_sessions.audience_type is
  'all_kisotsu=既卒全員向け / targeted=session_attendees の対象のみ。';

create index if not exists class_schedule_sessions_course_unit_idx
  on public.class_schedule_sessions (course_unit_id)
  where course_unit_id is not null;

-- =============================================================================
-- 4) class_schedule_session_attendees（コマの受講対象）
-- =============================================================================

create table if not exists public.class_schedule_session_attendees (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null
    references public.class_schedule_sessions (id) on delete cascade,
  student_id uuid not null
    references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint class_schedule_session_attendees_unique
    unique (session_id, student_id)
);

comment on table public.class_schedule_session_attendees is
  'コマ受講対象。audience_type=targeted 時に使用。実施記録がある行はアプリが削除を拒否。';

create index if not exists class_schedule_session_attendees_student_idx
  on public.class_schedule_session_attendees (student_id);

alter table public.class_schedule_session_attendees enable row level security;

drop policy if exists "class_schedule_session_attendees_select_super"
  on public.class_schedule_session_attendees;
create policy "class_schedule_session_attendees_select_super"
  on public.class_schedule_session_attendees for select to authenticated
  using (public.is_super_admin());

-- 生徒は自分の行のみ（他生徒の対象一覧は不可）
drop policy if exists "class_schedule_session_attendees_select_own"
  on public.class_schedule_session_attendees;
create policy "class_schedule_session_attendees_select_own"
  on public.class_schedule_session_attendees for select to authenticated
  using (
    student_id = auth.uid()
    and public.is_kisotsu_profile()
  );

drop policy if exists "class_schedule_session_attendees_insert_super"
  on public.class_schedule_session_attendees;
create policy "class_schedule_session_attendees_insert_super"
  on public.class_schedule_session_attendees for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists "class_schedule_session_attendees_update_super"
  on public.class_schedule_session_attendees;
create policy "class_schedule_session_attendees_update_super"
  on public.class_schedule_session_attendees for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "class_schedule_session_attendees_delete_super"
  on public.class_schedule_session_attendees;
create policy "class_schedule_session_attendees_delete_super"
  on public.class_schedule_session_attendees for delete to authenticated
  using (public.is_super_admin());

grant select, insert, update, delete on public.class_schedule_session_attendees to authenticated;

-- =============================================================================
-- 5) class_course_attendance_events（実施・欠席履歴・追記のみ）
-- =============================================================================

create table if not exists public.class_course_attendance_events (
  id uuid primary key default gen_random_uuid(),
  course_unit_id uuid not null
    references public.class_course_units (id) on delete restrict,
  student_id uuid not null
    references public.profiles (id) on delete cascade,
  assignment_id uuid
    references public.class_course_assignments (id) on delete set null,
  status text not null
    check (status in ('not_done', 'attended', 'absent')),
  event_date date not null,
  session_id uuid
    references public.class_schedule_sessions (id) on delete set null,
  note text,
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_at timestamptz not null default now()
);

comment on table public.class_course_attendance_events is
  '実施/欠席/未実施の履歴（追記）。消化は student×unit に attended が1件以上あるかで判定。';

create index if not exists class_course_attendance_events_unit_student_idx
  on public.class_course_attendance_events (course_unit_id, student_id, recorded_at desc);

create index if not exists class_course_attendance_events_student_idx
  on public.class_course_attendance_events (student_id, event_date desc);

create index if not exists class_course_attendance_events_session_idx
  on public.class_course_attendance_events (session_id)
  where session_id is not null;

alter table public.class_course_attendance_events enable row level security;

drop policy if exists "class_course_attendance_events_select_super"
  on public.class_course_attendance_events;
create policy "class_course_attendance_events_select_super"
  on public.class_course_attendance_events for select to authenticated
  using (public.is_super_admin());

drop policy if exists "class_course_attendance_events_insert_super"
  on public.class_course_attendance_events;
create policy "class_course_attendance_events_insert_super"
  on public.class_course_attendance_events for insert to authenticated
  with check (public.is_super_admin());

-- 訂正は追記のみ。UPDATE/DELETE は付与しない（履歴保持）
revoke update, delete on public.class_course_attendance_events from authenticated;
grant select, insert on public.class_course_attendance_events to authenticated;

-- =============================================================================
-- 6) RPC: 共通授業作成＋割当（advisory lock）
-- =============================================================================

create or replace function public.create_class_course_units_with_assignments(
  p_academic_year integer,
  p_term text,
  p_subject text,
  p_track text,
  p_seq_numbers integer[],
  p_student_ids uuid[],
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_ok boolean;
  v_lock_key bigint;
  v_seq integer;
  v_unit_id uuid;
  v_student uuid;
  v_created uuid[] := '{}';
  v_n integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  select exists (
    select 1 from public.profiles
    where id = p_actor_id
      and role = 'admin'
      and is_super_admin = true
  ) into v_actor_ok;

  if not coalesce(v_actor_ok, false) then
    raise exception 'super admin required';
  end if;

  if p_seq_numbers is null or cardinality(p_seq_numbers) < 1 then
    raise exception 'seq numbers required';
  end if;

  if cardinality(p_seq_numbers) > 50 then
    raise exception 'too many units';
  end if;

  if p_student_ids is null or cardinality(p_student_ids) < 1 then
    raise exception 'students required';
  end if;

  -- scope lock
  v_lock_key := hashtextextended(
    p_academic_year::text || ':' || p_term || ':' || p_subject || ':' || p_track,
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  foreach v_seq in array p_seq_numbers loop
    if v_seq < 1 or v_seq > 99 then
      raise exception 'invalid seq';
    end if;
    if exists (
      select 1 from public.class_course_units
      where academic_year = p_academic_year
        and term = p_term
        and subject = p_subject
        and track = p_track
        and seq_no = v_seq
    ) then
      raise exception 'seq conflict: %', v_seq;
    end if;

    insert into public.class_course_units (
      academic_year, term, subject, track, seq_no, created_by
    ) values (
      p_academic_year, p_term, p_subject, p_track, v_seq, p_actor_id
    )
    returning id into v_unit_id;

    v_created := array_append(v_created, v_unit_id);

    foreach v_student in array p_student_ids loop
      insert into public.class_course_assignments (
        course_unit_id, student_id, status, created_by
      ) values (
        v_unit_id, v_student, 'active', p_actor_id
      );
    end loop;
  end loop;

  v_n := cardinality(v_created);
  return jsonb_build_object(
    'ok', true,
    'unit_ids', to_jsonb(v_created),
    'count', v_n
  );
end;
$$;

revoke all on function public.create_class_course_units_with_assignments(
  integer, text, text, text, integer[], uuid[], uuid
) from public;
revoke all on function public.create_class_course_units_with_assignments(
  integer, text, text, text, integer[], uuid[], uuid
) from anon, authenticated;
grant execute on function public.create_class_course_units_with_assignments(
  integer, text, text, text, integer[], uuid[], uuid
) to service_role;

comment on function public.create_class_course_units_with_assignments is
  '大管理者のみ。scope advisory lock 下で共通授業＋割当を同一TX作成。';

-- =============================================================================
-- 7) RPC: 既存授業へ生徒追加（二重active禁止）
-- =============================================================================

create or replace function public.add_students_to_class_course_units(
  p_unit_ids uuid[],
  p_student_ids uuid[],
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_ok boolean;
  v_unit uuid;
  v_student uuid;
  v_inserted integer := 0;
  v_skipped integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  select exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and is_super_admin = true
  ) into v_actor_ok;

  if not coalesce(v_actor_ok, false) then
    raise exception 'super admin required';
  end if;

  if p_unit_ids is null or cardinality(p_unit_ids) < 1 then
    raise exception 'units required';
  end if;
  if p_student_ids is null or cardinality(p_student_ids) < 1 then
    raise exception 'students required';
  end if;

  foreach v_unit in array p_unit_ids loop
    perform pg_advisory_xact_lock(hashtextextended(v_unit::text, 0));
    foreach v_student in array p_student_ids loop
      if exists (
        select 1 from public.class_course_assignments
        where course_unit_id = v_unit
          and student_id = v_student
          and status = 'active'
      ) then
        v_skipped := v_skipped + 1;
      else
        insert into public.class_course_assignments (
          course_unit_id, student_id, status, created_by
        ) values (
          v_unit, v_student, 'active', p_actor_id
        );
        v_inserted := v_inserted + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'skipped_duplicate', v_skipped
  );
end;
$$;

revoke all on function public.add_students_to_class_course_units(uuid[], uuid[], uuid)
  from public;
revoke all on function public.add_students_to_class_course_units(uuid[], uuid[], uuid)
  from anon, authenticated;
grant execute on function public.add_students_to_class_course_units(uuid[], uuid[], uuid)
  to service_role;

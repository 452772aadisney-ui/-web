-- 070: 残回数根拠の明文化・生徒割当公開縮小・実施追記RPC・履歴source・course_unit再紐づけ条件緩和
-- 依存: 067–069
-- 本番はこのチャットから自動実行しない。

-- =============================================================================
-- 1) 生徒は割当表を読めない（対象判定は session_attendees のみ）
-- =============================================================================

drop policy if exists "class_course_assignments_select_own"
  on public.class_course_assignments;

comment on table public.class_course_assignments is
  '共通授業への生徒割当。SELECT は大管理者のみ。生徒のコマ対象判定は session_attendees を用いる。';

-- =============================================================================
-- 2) 実施履歴: source で手入力とコマ由来を区別（session_id NULL 後も識別）
-- =============================================================================

alter table public.class_course_attendance_events
  add column if not exists source text;

update public.class_course_attendance_events
set source = case
  when session_id is not null then 'session'
  else 'manual'
end
where source is null;

alter table public.class_course_attendance_events
  alter column source set default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'class_course_attendance_events_source_check'
  ) then
    alter table public.class_course_attendance_events
      add constraint class_course_attendance_events_source_check
      check (source in ('session', 'manual'));
  end if;
end $$;

alter table public.class_course_attendance_events
  alter column source set not null;

comment on column public.class_course_attendance_events.source is
  'session=コマ経由で記録 / manual=手入力。コマ削除で session_id が null になっても source は残る。';

comment on table public.class_course_attendance_events is
  '実施/欠席/未実施の履歴（追記）。消化は最新 status=attended のときのみ（過去 attended が残っても最新が未実施なら未消化）。';

-- =============================================================================
-- 3) course_unit_id: このコマに紐づく実施履歴が無いときだけ付け替え可
-- =============================================================================

create or replace function public.tg_deny_session_course_unit_rebind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.course_unit_id is not distinct from new.course_unit_id then
    return new;
  end if;

  if exists (
    select 1
    from public.class_course_attendance_events e
    where e.session_id = old.id
  ) then
    raise exception 'course_unit_id is immutable while session has attendance events'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- trigger already exists from 069; replace function only

-- =============================================================================
-- 4) 対象外し RPC: 実施/取消と同じ割当行を先に FOR UPDATE（競合直列化）
-- =============================================================================

create or replace function public.remove_class_schedule_session_attendee(
  p_session_id uuid,
  p_student_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid;
  v_assignment_id uuid;
  v_status text;
  v_deleted integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and is_super_admin = true
  ) then
    raise exception 'super admin required';
  end if;

  -- Resolve course without locking session first (keep lock order: assignment → …)
  select s.course_unit_id into v_course
  from public.class_schedule_sessions s
  where s.id = p_session_id;

  if v_course is null then
    raise exception 'not a course-linked session';
  end if;

  -- Same lock target / order as record_class_course_attendance / cancel
  select a.id into v_assignment_id
  from public.class_course_assignments a
  where a.course_unit_id = v_course
    and a.student_id = p_student_id
    and a.status = 'active'
  for update;

  select e.status into v_status
  from public.class_course_attendance_events e
  where e.course_unit_id = v_course
    and e.student_id = p_student_id
  order by e.recorded_at desc
  limit 1;

  if v_status in ('attended', 'absent') then
    raise exception 'attendee has attendance record';
  end if;

  -- Re-check after assignment lock (race with concurrent attend)
  select e.status into v_status
  from public.class_course_attendance_events e
  where e.course_unit_id = v_course
    and e.student_id = p_student_id
  order by e.recorded_at desc
  limit 1;

  if v_status in ('attended', 'absent') then
    raise exception 'attendee has attendance record';
  end if;

  delete from public.class_schedule_session_attendees
  where session_id = p_session_id
    and student_id = p_student_id;

  get diagnostics v_deleted = row_count;

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

revoke all on function public.remove_class_schedule_session_attendee(uuid, uuid, uuid)
  from public;
revoke all on function public.remove_class_schedule_session_attendee(uuid, uuid, uuid)
  from anon, authenticated;
grant execute on function public.remove_class_schedule_session_attendee(uuid, uuid, uuid)
  to service_role;

-- =============================================================================
-- 5) 実施追記 RPC: assignment 行を FOR UPDATE し、有効実施の重複追記を防ぐ
--    cancel / remove と同じ割当行ロック順序
-- =============================================================================

create or replace function public.record_class_course_attendance(
  p_course_unit_id uuid,
  p_student_id uuid,
  p_status text,
  p_event_date date,
  p_session_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_latest text;
  v_source text;
  v_session_status text;
  v_day_status text;
  v_event_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'admin' and is_super_admin = true
  ) then
    raise exception 'super admin required';
  end if;

  if p_status is null or p_status not in ('not_done', 'attended', 'absent') then
    raise exception 'invalid status';
  end if;

  -- Same lock target as cancel_class_course_assignment
  select a.id into v_assignment_id
  from public.class_course_assignments a
  where a.course_unit_id = p_course_unit_id
    and a.student_id = p_student_id
    and a.status = 'active'
  for update;

  if v_assignment_id is null then
    raise exception 'active assignment not found';
  end if;

  if p_session_id is not null then
    select s.status, d.status
    into v_session_status, v_day_status
    from public.class_schedule_sessions s
    join public.class_schedule_days d on d.id = s.day_id
    where s.id = p_session_id
    for update of s;

    if v_session_status is null then
      raise exception 'session not found';
    end if;

    if (v_day_status = 'cancelled' or v_session_status = 'cancelled')
       and p_status <> 'not_done' then
      raise exception 'cancelled session blocks new attendance';
    end if;

    v_source := 'session';
  else
    v_source := 'manual';
  end if;

  select e.status into v_latest
  from public.class_course_attendance_events e
  where e.course_unit_id = p_course_unit_id
    and e.student_id = p_student_id
  order by e.recorded_at desc
  limit 1;

  -- 有効な実施が既にあるのに再度 attended を追記しない（消化は最新 status で判定）
  if p_status = 'attended' and v_latest = 'attended' then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'already_attended'
    );
  end if;

  insert into public.class_course_attendance_events (
    course_unit_id,
    student_id,
    assignment_id,
    status,
    event_date,
    session_id,
    source,
    recorded_by
  ) values (
    p_course_unit_id,
    p_student_id,
    v_assignment_id,
    p_status,
    p_event_date,
    p_session_id,
    v_source,
    p_actor_id
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true,
    'skipped', false,
    'event_id', v_event_id
  );
end;
$$;

revoke all on function public.record_class_course_attendance(
  uuid, uuid, text, date, uuid, uuid
) from public;
revoke all on function public.record_class_course_attendance(
  uuid, uuid, text, date, uuid, uuid
) from anon, authenticated;
grant execute on function public.record_class_course_attendance(
  uuid, uuid, text, date, uuid, uuid
) to service_role;

notify pgrst, 'reload schema';

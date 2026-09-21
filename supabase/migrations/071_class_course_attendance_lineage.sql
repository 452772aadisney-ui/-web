-- 071: 受講記録の lineage 単位の最新判定・コマ/日削除ガード
-- 依存: 070
-- 本番はこのチャットから自動実行しない。

-- =============================================================================
-- 1) attendance_lineage_id: コマ削除後も訂正対象を一意に識別
--    コマ由来は session の uuid を採用（session_id が SET NULL されても残る）
--    手入力は初回に採番し、以降の訂正で引き継ぐ
-- =============================================================================

alter table public.class_course_attendance_events
  add column if not exists attendance_lineage_id uuid;

update public.class_course_attendance_events
set attendance_lineage_id = coalesce(session_id, id)
where attendance_lineage_id is null;

alter table public.class_course_attendance_events
  alter column attendance_lineage_id set not null;

create index if not exists class_course_attendance_events_lineage_idx
  on public.class_course_attendance_events (
    course_unit_id,
    student_id,
    attendance_lineage_id,
    recorded_at desc
  );

comment on column public.class_course_attendance_events.attendance_lineage_id is
  '同一受講記録の訂正チェーンID。コマ由来は元 session uuid。手入力は初回採番。session_id ON DELETE SET NULL 後も不変。';

comment on table public.class_course_attendance_events is
  '実施/欠席/未実施の履歴（追記）。消化は生徒×共通授業あたり、lineage 最新が attended のものが1つ以上あるとき（最大1カウント）。';

-- =============================================================================
-- 2) 対象外し: 当該コマ lineage の最新のみ見る（別コマの実施で誤ブロックしない）
-- =============================================================================

create or replace function public.tg_deny_session_attendee_delete_with_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course uuid;
  v_status text;
begin
  select s.course_unit_id into v_course
  from public.class_schedule_sessions s
  where s.id = old.session_id;

  if v_course is null then
    return old;
  end if;

  select e.status into v_status
  from public.class_course_attendance_events e
  where e.course_unit_id = v_course
    and e.student_id = old.student_id
    and e.attendance_lineage_id = old.session_id
  order by e.recorded_at desc
  limit 1;

  if v_status in ('attended', 'absent') then
    raise exception 'attendee has attendance record'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

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

  select s.course_unit_id into v_course
  from public.class_schedule_sessions s
  where s.id = p_session_id;

  if v_course is null then
    raise exception 'not a course-linked session';
  end if;

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
    and e.attendance_lineage_id = p_session_id
  order by e.recorded_at desc
  limit 1;

  if v_status in ('attended', 'absent') then
    raise exception 'attendee has attendance record';
  end if;

  select e.status into v_status
  from public.class_course_attendance_events e
  where e.course_unit_id = v_course
    and e.student_id = p_student_id
    and e.attendance_lineage_id = p_session_id
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
-- 3) 割当取消: いずれかの lineage 最新が attended なら不可
-- =============================================================================

create or replace function public.cancel_class_course_assignment(
  p_course_unit_id uuid,
  p_student_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_on_sessions integer;
  v_updated integer;
  v_has_attended boolean;
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

  select a.id into v_assignment_id
  from public.class_course_assignments a
  where a.course_unit_id = p_course_unit_id
    and a.student_id = p_student_id
    and a.status = 'active'
  for update;

  if v_assignment_id is null then
    raise exception 'active assignment not found';
  end if;

  select exists (
    select 1
    from (
      select distinct on (e.attendance_lineage_id) e.status
      from public.class_course_attendance_events e
      where e.course_unit_id = p_course_unit_id
        and e.student_id = p_student_id
      order by e.attendance_lineage_id, e.recorded_at desc
    ) latest
    where latest.status = 'attended'
  ) into v_has_attended;

  if coalesce(v_has_attended, false) then
    raise exception 'assignment has attended record';
  end if;

  select count(*)::integer into v_on_sessions
  from public.class_schedule_session_attendees a
  join public.class_schedule_sessions s on s.id = a.session_id
  where a.student_id = p_student_id
    and s.course_unit_id = p_course_unit_id;

  if coalesce(v_on_sessions, 0) > 0 then
    raise exception 'student still on session attendees';
  end if;

  select exists (
    select 1
    from (
      select distinct on (e.attendance_lineage_id) e.status
      from public.class_course_attendance_events e
      where e.course_unit_id = p_course_unit_id
        and e.student_id = p_student_id
      order by e.attendance_lineage_id, e.recorded_at desc
    ) latest
    where latest.status = 'attended'
  ) into v_has_attended;

  if coalesce(v_has_attended, false) then
    raise exception 'assignment has attended record';
  end if;

  update public.class_course_assignments
  set status = 'cancelled',
      cancelled_at = now()
  where id = v_assignment_id
    and status = 'active';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'active assignment not found';
  end if;

  return jsonb_build_object('ok', true, 'cancelled', v_updated);
end;
$$;

revoke all on function public.cancel_class_course_assignment(uuid, uuid, uuid)
  from public;
revoke all on function public.cancel_class_course_assignment(uuid, uuid, uuid)
  from anon, authenticated;
grant execute on function public.cancel_class_course_assignment(uuid, uuid, uuid)
  to service_role;

-- =============================================================================
-- 4) コマ DELETE ガード（日 CASCADE 含む）
--    履歴 DELETE 禁止ではなく、当該 lineage に有効な実施/欠席が残るコマの削除を拒否
--    DELETE 行ロックと実施 RPC の session FOR UPDATE で同時実行を直列化
-- =============================================================================

create or replace function public.tg_deny_session_delete_with_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blocked boolean;
begin
  if old.course_unit_id is null then
    return old;
  end if;

  select exists (
    select 1
    from (
      select distinct on (e.student_id) e.status
      from public.class_course_attendance_events e
      where e.attendance_lineage_id = old.id
      order by e.student_id, e.recorded_at desc
    ) latest
    where latest.status in ('attended', 'absent')
  ) into v_blocked;

  if coalesce(v_blocked, false) then
    raise exception 'session has attendance record; correct to not_done first'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

drop trigger if exists class_schedule_sessions_deny_delete_with_attendance
  on public.class_schedule_sessions;
create trigger class_schedule_sessions_deny_delete_with_attendance
  before delete on public.class_schedule_sessions
  for each row
  execute function public.tg_deny_session_delete_with_attendance();

-- =============================================================================
-- 5) 実施追記 RPC: lineage 単位の最新 + 他 lineage の有効実施と衝突したらエラー
-- =============================================================================

drop function if exists public.record_class_course_attendance(
  uuid, uuid, text, date, uuid, uuid
);

create or replace function public.record_class_course_attendance(
  p_course_unit_id uuid,
  p_student_id uuid,
  p_status text,
  p_event_date date,
  p_session_id uuid,
  p_attendance_lineage_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_lineage uuid;
  v_lineage_latest text;
  v_other_attended boolean;
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
    v_lineage := p_session_id;
  else
    v_source := 'manual';
    if p_attendance_lineage_id is not null then
      v_lineage := p_attendance_lineage_id;
    else
      v_lineage := gen_random_uuid();
    end if;
  end if;

  select e.status into v_lineage_latest
  from public.class_course_attendance_events e
  where e.course_unit_id = p_course_unit_id
    and e.student_id = p_student_id
    and e.attendance_lineage_id = v_lineage
  order by e.recorded_at desc
  limit 1;

  if p_status = 'attended' then
    if v_lineage_latest = 'attended' then
      return jsonb_build_object(
        'ok', true,
        'skipped', true,
        'reason', 'already_attended_same_lineage'
      );
    end if;

    select exists (
      select 1
      from (
        select distinct on (e.attendance_lineage_id)
          e.attendance_lineage_id,
          e.status
        from public.class_course_attendance_events e
        where e.course_unit_id = p_course_unit_id
          and e.student_id = p_student_id
          and e.attendance_lineage_id is distinct from v_lineage
        order by e.attendance_lineage_id, e.recorded_at desc
      ) other_latest
      where other_latest.status = 'attended'
    ) into v_other_attended;

    if coalesce(v_other_attended, false) then
      raise exception 'effective attendance already exists on another lineage'
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.class_course_attendance_events (
    course_unit_id,
    student_id,
    assignment_id,
    status,
    event_date,
    session_id,
    attendance_lineage_id,
    source,
    recorded_by
  ) values (
    p_course_unit_id,
    p_student_id,
    v_assignment_id,
    p_status,
    p_event_date,
    p_session_id,
    v_lineage,
    v_source,
    p_actor_id
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'ok', true,
    'skipped', false,
    'event_id', v_event_id,
    'attendance_lineage_id', v_lineage
  );
end;
$$;

revoke all on function public.record_class_course_attendance(
  uuid, uuid, text, date, uuid, uuid, uuid
) from public;
revoke all on function public.record_class_course_attendance(
  uuid, uuid, text, date, uuid, uuid, uuid
) from anon, authenticated;
grant execute on function public.record_class_course_attendance(
  uuid, uuid, text, date, uuid, uuid, uuid
) to service_role;

notify pgrst, 'reload schema';

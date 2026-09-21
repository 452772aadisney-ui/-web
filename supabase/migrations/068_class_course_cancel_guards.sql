-- 068: 割当取消・コマ対象外しの DB/RPC ガード
-- 依存: 067_class_course_sessions
-- 本番はこのチャットから自動実行しない。

-- =============================================================================
-- 1) 対象外し: 最新が実施/欠席なら DELETE 不可（直接リクエストでも）
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
  order by e.recorded_at desc
  limit 1;

  if v_status in ('attended', 'absent') then
    raise exception 'attendee has attendance record'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

drop trigger if exists class_schedule_session_attendees_deny_delete_with_record
  on public.class_schedule_session_attendees;
create trigger class_schedule_session_attendees_deny_delete_with_record
  before delete on public.class_schedule_session_attendees
  for each row
  execute function public.tg_deny_session_attendee_delete_with_record();

-- =============================================================================
-- 2) RPC: コマ対象から外す（割当は残す）
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
  v_actor_ok boolean;
  v_course uuid;
  v_status text;
  v_deleted integer;
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

  select s.course_unit_id into v_course
  from public.class_schedule_sessions s
  where s.id = p_session_id;

  if v_course is null then
    raise exception 'not a course-linked session';
  end if;

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
-- 3) RPC: 割当取消（実施中なら不可・対象コマが残っていれば不可・履歴は残す）
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
  v_actor_ok boolean;
  v_status text;
  v_on_sessions integer;
  v_updated integer;
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

  select e.status into v_status
  from public.class_course_attendance_events e
  where e.course_unit_id = p_course_unit_id
    and e.student_id = p_student_id
  order by e.recorded_at desc
  limit 1;

  if v_status = 'attended' then
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

  update public.class_course_assignments
  set status = 'cancelled',
      cancelled_at = now()
  where course_unit_id = p_course_unit_id
    and student_id = p_student_id
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
-- 4) 再追加: 取消済みがあっても active 二重を作らない（既存 RPC 強化）
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
  v_reactivated integer := 0;
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
      elsif exists (
        select 1 from public.class_course_assignments
        where course_unit_id = v_unit
          and student_id = v_student
          and status = 'cancelled'
      ) then
        -- 最新の cancelled 行を active に戻す（二重 active を作らない）
        update public.class_course_assignments
        set status = 'active',
            cancelled_at = null,
            created_by = coalesce(created_by, p_actor_id)
        where id = (
          select id from public.class_course_assignments
          where course_unit_id = v_unit
            and student_id = v_student
            and status = 'cancelled'
          order by cancelled_at desc nulls last, created_at desc
          limit 1
        );
        v_reactivated := v_reactivated + 1;
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
    'reactivated', v_reactivated,
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

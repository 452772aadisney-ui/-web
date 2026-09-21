-- 069: コマ＋共通授業紐づけ＋対象生徒を同一TXで保存（原子性）
-- 依存: 067, 068
-- 本番はこのチャットから自動実行しない。
-- 旧 create_class_schedule_day_with_sessions は維持（自由記述のみ／旧アプリ互換）。

-- =============================================================================
-- Helpers: display subject from unit (app may also pass subject; RPC recomputes)
-- =============================================================================

create or replace function public.class_course_unit_display_subject(p_unit_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_subject text;
  v_term text;
  v_track text;
  v_seq integer;
  v_subject_label text;
  v_term_label text;
  v_seq_label text;
begin
  select subject, term, track, seq_no
  into v_subject, v_term, v_track, v_seq
  from public.class_course_units
  where id = p_unit_id;

  if v_subject is null then
    return null;
  end if;

  v_subject_label := case v_subject
    when 'english_grammar' then '英文法'
    when 'english_reading' then '英文読解'
    when 'math_iaiibc' then '数学IAIIBC'
    when 'math_iii' then '数学Ⅲ'
    when 'physics' then '物理'
    when 'japanese' then '国語'
    else v_subject
  end;

  v_term_label := case v_term
    when 'spring' then '春期'
    when 'first_half' then '前期'
    when 'summer' then '夏期'
    when 'second_half' then '後期'
    when 'winter' then '冬期'
    when 'pre_exam' then '直前期'
    else v_term
  end;

  if v_seq >= 1 and v_seq <= 20 then
    v_seq_label := chr(9311 + v_seq); -- U+2460..U+2473
  elsif v_seq >= 21 and v_seq <= 35 then
    v_seq_label := chr(12860 + v_seq); -- U+3251 = 12881 for 21
  elsif v_seq >= 36 and v_seq <= 50 then
    v_seq_label := chr(12941 + v_seq); -- U+32B1 = 12977 for 36
  else
    v_seq_label := '（' || v_seq::text || '）';
  end if;

  if v_track = 'addon' then
    return v_subject_label || '・' || v_term_label || '・追加' || v_seq_label;
  end if;
  return v_subject_label || '・' || v_term_label || v_seq_label;
end;
$$;

revoke all on function public.class_course_unit_display_subject(uuid) from public;
revoke all on function public.class_course_unit_display_subject(uuid) from anon, authenticated;
grant execute on function public.class_course_unit_display_subject(uuid) to service_role;

-- =============================================================================
-- course_unit_id: once set, do not change/clear (history stays on unit id)
-- =============================================================================

create or replace function public.tg_deny_session_course_unit_rebind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.course_unit_id is not null
     and new.course_unit_id is distinct from old.course_unit_id then
    raise exception 'course_unit_id is immutable once set'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists class_schedule_sessions_deny_course_unit_rebind
  on public.class_schedule_sessions;
create trigger class_schedule_sessions_deny_course_unit_rebind
  before update of course_unit_id on public.class_schedule_sessions
  for each row
  execute function public.tg_deny_session_course_unit_rebind();

-- =============================================================================
-- 1) Atomic day create with optional course links + attendees
-- sessions jsonb element:
--   start_time, end_time, subject, note,
--   course_unit_id (optional uuid), attendee_ids (optional uuid[])
-- =============================================================================

create or replace function public.create_class_schedule_day_with_course_sessions(
  p_schedule_date date,
  p_venue_name text,
  p_location_details text,
  p_sessions jsonb,
  p_actor_id uuid
)
returns table (day_id uuid, notify_revision integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day_id uuid;
  v_revision integer;
  v_session jsonb;
  v_start time;
  v_end time;
  v_subject text;
  v_note text;
  v_count integer;
  v_venue text;
  v_location text;
  v_course uuid;
  v_attendee uuid;
  v_attendees uuid[];
  v_session_id uuid;
  v_display text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: service_role only'
      using errcode = '42501';
  end if;

  if p_actor_id is null then
    raise exception 'actor id is required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_actor_id and p.role = 'admin' and p.is_super_admin = true
  ) then
    raise exception 'permission denied: super admin actor required'
      using errcode = '42501';
  end if;

  v_venue := trim(coalesce(p_venue_name, ''));
  if char_length(v_venue) = 0 or char_length(v_venue) > 200 then
    raise exception 'invalid venue_name' using errcode = '22023';
  end if;

  v_location := nullif(trim(both E'\n\r\t ' from coalesce(p_location_details, '')), '');
  if v_location is not null and char_length(v_location) > 2000 then
    raise exception 'invalid location_details' using errcode = '22023';
  end if;

  if p_sessions is null or jsonb_typeof(p_sessions) is distinct from 'array' then
    raise exception 'sessions must be a non-empty json array' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_sessions);
  if v_count is null or v_count < 1 then
    raise exception 'at least one session is required' using errcode = '22023';
  end if;
  if v_count > 24 then
    raise exception 'too many sessions' using errcode = '22023';
  end if;

  insert into public.class_schedule_days as csd (
    schedule_date, venue_name, location_details,
    address, map_url, room_note,
    status, notify_revision, created_by, updated_by
  ) values (
    p_schedule_date, v_venue, v_location,
    null, null, null,
    'scheduled', 1, p_actor_id, p_actor_id
  )
  returning csd.id, csd.notify_revision into v_day_id, v_revision;

  perform 1 from public.class_schedule_days d where d.id = v_day_id for update;

  for v_session in
    select je.value from jsonb_array_elements(p_sessions) as je(value)
  loop
    begin
      v_start := (v_session->>'start_time')::time;
      v_end := (v_session->>'end_time')::time;
    exception when others then
      raise exception 'invalid session time' using errcode = '22023';
    end;

    if v_end <= v_start then
      raise exception 'session end_time must be after start_time' using errcode = '22023';
    end if;

    v_note := nullif(trim(coalesce(v_session->>'note', '')), '');
    if v_note is not null and char_length(v_note) > 500 then
      raise exception 'invalid session note' using errcode = '22023';
    end if;

    v_course := null;
    if v_session ? 'course_unit_id'
       and nullif(trim(coalesce(v_session->>'course_unit_id', '')), '') is not null then
      begin
        v_course := (v_session->>'course_unit_id')::uuid;
      exception when others then
        raise exception 'invalid course_unit_id' using errcode = '22023';
      end;
    end if;

    if v_course is not null then
      v_display := public.class_course_unit_display_subject(v_course);
      if v_display is null then
        raise exception 'course unit not found' using errcode = '22023';
      end if;
      v_subject := v_display;

      v_attendees := coalesce((
        select array_agg(x::uuid)
        from jsonb_array_elements_text(coalesce(v_session->'attendee_ids', '[]'::jsonb)) as t(x)
      ), '{}'::uuid[]);

      if cardinality(v_attendees) < 1 then
        raise exception 'attendees required for course session' using errcode = '22023';
      end if;

      foreach v_attendee in array v_attendees loop
        if not exists (
          select 1 from public.class_course_assignments a
          where a.course_unit_id = v_course
            and a.student_id = v_attendee
            and a.status = 'active'
        ) then
          raise exception 'attendee missing active assignment' using errcode = '22023';
        end if;
      end loop;

      insert into public.class_schedule_sessions as css (
        day_id, start_time, end_time, subject, note, status,
        course_unit_id, audience_type
      ) values (
        v_day_id, v_start, v_end, v_subject, v_note, 'scheduled',
        v_course, 'targeted'
      )
      returning css.id into v_session_id;

      insert into public.class_schedule_session_attendees (session_id, student_id)
      select v_session_id, unnest(v_attendees);
    else
      v_subject := trim(coalesce(v_session->>'subject', ''));
      if char_length(v_subject) = 0 or char_length(v_subject) > 100 then
        raise exception 'session subject is required' using errcode = '22023';
      end if;
      if v_subject ~ '[[:cntrl:]]' then
        raise exception 'session subject is required' using errcode = '22023';
      end if;

      insert into public.class_schedule_sessions as css (
        day_id, start_time, end_time, subject, note, status, audience_type
      ) values (
        v_day_id, v_start, v_end, v_subject, v_note, 'scheduled', 'all_kisotsu'
      );
    end if;
  end loop;

  day_id := v_day_id;
  notify_revision := v_revision;
  return next;
end;
$$;

revoke all on function public.create_class_schedule_day_with_course_sessions(
  date, text, text, jsonb, uuid
) from public;
revoke all on function public.create_class_schedule_day_with_course_sessions(
  date, text, text, jsonb, uuid
) from anon, authenticated;
grant execute on function public.create_class_schedule_day_with_course_sessions(
  date, text, text, jsonb, uuid
) to service_role;

-- =============================================================================
-- 2) Atomic add session (+ optional course + attendees)
-- =============================================================================

create or replace function public.add_class_schedule_session_with_course(
  p_day_id uuid,
  p_start_time time,
  p_end_time time,
  p_subject text,
  p_note text,
  p_course_unit_id uuid,
  p_attendee_ids uuid[],
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_subject text;
  v_note text;
  v_attendee uuid;
  v_display text;
  v_day_status text;
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

  select status into v_day_status
  from public.class_schedule_days
  where id = p_day_id
  for update;

  if v_day_status is null then
    raise exception 'day not found';
  end if;
  if v_day_status = 'cancelled' then
    raise exception 'day cancelled';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'invalid session time';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  if p_course_unit_id is not null then
    v_display := public.class_course_unit_display_subject(p_course_unit_id);
    if v_display is null then
      raise exception 'course unit not found';
    end if;
    v_subject := v_display;
    if p_attendee_ids is null or cardinality(p_attendee_ids) < 1 then
      raise exception 'attendees required';
    end if;
    foreach v_attendee in array p_attendee_ids loop
      if not exists (
        select 1 from public.class_course_assignments
        where course_unit_id = p_course_unit_id
          and student_id = v_attendee
          and status = 'active'
      ) then
        raise exception 'attendee missing active assignment';
      end if;
    end loop;

    insert into public.class_schedule_sessions (
      day_id, start_time, end_time, subject, note, status,
      course_unit_id, audience_type
    ) values (
      p_day_id, p_start_time, p_end_time, v_subject, v_note, 'scheduled',
      p_course_unit_id, 'targeted'
    )
    returning id into v_session_id;

    insert into public.class_schedule_session_attendees (session_id, student_id)
    select v_session_id, unnest(p_attendee_ids);
  else
    v_subject := trim(coalesce(p_subject, ''));
    if char_length(v_subject) = 0 then
      raise exception 'subject required';
    end if;
    insert into public.class_schedule_sessions (
      day_id, start_time, end_time, subject, note, status, audience_type
    ) values (
      p_day_id, p_start_time, p_end_time, v_subject, v_note, 'scheduled', 'all_kisotsu'
    )
    returning id into v_session_id;
  end if;

  return jsonb_build_object('ok', true, 'session_id', v_session_id);
end;
$$;

revoke all on function public.add_class_schedule_session_with_course(
  uuid, time, time, text, text, uuid, uuid[], uuid
) from public;
revoke all on function public.add_class_schedule_session_with_course(
  uuid, time, time, text, text, uuid, uuid[], uuid
) from anon, authenticated;
grant execute on function public.add_class_schedule_session_with_course(
  uuid, time, time, text, text, uuid, uuid[], uuid
) to service_role;

-- =============================================================================
-- 3) Atomic session field update + attendee replace (with attendance guards)
-- =============================================================================

create or replace function public.update_class_schedule_session_with_course(
  p_session_id uuid,
  p_day_id uuid,
  p_start_time time,
  p_end_time time,
  p_subject text,
  p_note text,
  p_course_unit_id uuid,
  p_attendee_ids uuid[],
  p_manage_attendees boolean,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day_status text;
  v_course uuid;
  v_audience text;
  v_subject text;
  v_note text;
  v_attendee uuid;
  v_desired uuid[];
  v_existing uuid;
  v_status text;
  v_display text;
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

  select d.status into v_day_status
  from public.class_schedule_days d
  where d.id = p_day_id
  for update;
  if v_day_status is null then
    raise exception 'day not found';
  end if;
  if v_day_status = 'cancelled' then
    raise exception 'day cancelled';
  end if;

  select s.course_unit_id, s.audience_type
  into v_course, v_audience
  from public.class_schedule_sessions s
  where s.id = p_session_id and s.day_id = p_day_id
  for update;

  if not found then
    raise exception 'session not found';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'invalid session time';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  -- Link freeform → course only when currently unlinked
  if v_course is null and p_course_unit_id is not null then
    v_display := public.class_course_unit_display_subject(p_course_unit_id);
    if v_display is null then
      raise exception 'course unit not found';
    end if;
    v_subject := v_display;
    v_course := p_course_unit_id;
    v_audience := 'targeted';
  elsif v_course is not null then
    v_subject := public.class_course_unit_display_subject(v_course);
    v_audience := 'targeted';
  else
    v_subject := trim(coalesce(p_subject, ''));
    if char_length(v_subject) = 0 then
      raise exception 'subject required';
    end if;
  end if;

  update public.class_schedule_sessions
  set start_time = p_start_time,
      end_time = p_end_time,
      subject = v_subject,
      note = v_note,
      course_unit_id = v_course,
      audience_type = coalesce(v_audience, audience_type)
  where id = p_session_id
    and day_id = p_day_id;

  if p_manage_attendees and v_course is not null then
    v_desired := coalesce(p_attendee_ids, '{}'::uuid[]);
    if cardinality(v_desired) < 1 then
      raise exception 'attendees required';
    end if;

    foreach v_attendee in array v_desired loop
      if not exists (
        select 1 from public.class_course_assignments
        where course_unit_id = v_course
          and student_id = v_attendee
          and status = 'active'
      ) then
        raise exception 'attendee missing active assignment';
      end if;
    end loop;

    -- Remove missing (trigger blocks attended/absent latest)
    for v_existing in
      select a.student_id
      from public.class_schedule_session_attendees a
      where a.session_id = p_session_id
        and a.student_id <> all (v_desired)
    loop
      select e.status into v_status
      from public.class_course_attendance_events e
      where e.course_unit_id = v_course
        and e.student_id = v_existing
      order by e.recorded_at desc
      limit 1;
      if v_status in ('attended', 'absent') then
        raise exception 'attendee has attendance record';
      end if;
      delete from public.class_schedule_session_attendees
      where session_id = p_session_id and student_id = v_existing;
    end loop;

    -- Add new
    insert into public.class_schedule_session_attendees (session_id, student_id)
    select p_session_id, d
    from unnest(v_desired) as d
    where not exists (
      select 1 from public.class_schedule_session_attendees a
      where a.session_id = p_session_id and a.student_id = d
    );
  end if;

  return jsonb_build_object('ok', true, 'session_id', p_session_id);
end;
$$;

revoke all on function public.update_class_schedule_session_with_course(
  uuid, uuid, time, time, text, text, uuid, uuid[], boolean, uuid
) from public;
revoke all on function public.update_class_schedule_session_with_course(
  uuid, uuid, time, time, text, text, uuid, uuid[], boolean, uuid
) from anon, authenticated;
grant execute on function public.update_class_schedule_session_with_course(
  uuid, uuid, time, time, text, text, uuid, uuid[], boolean, uuid
) to service_role;

-- =============================================================================
-- 4) Harden cancel_class_course_assignment against concurrent attend
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
  v_assignment_id uuid;
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

  select a.id into v_assignment_id
  from public.class_course_assignments a
  where a.course_unit_id = p_course_unit_id
    and a.student_id = p_student_id
    and a.status = 'active'
  for update;

  if v_assignment_id is null then
    raise exception 'active assignment not found';
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

  -- Re-check latest attendance after locks (race with concurrent attend)
  select e.status into v_status
  from public.class_course_attendance_events e
  where e.course_unit_id = p_course_unit_id
    and e.student_id = p_student_id
  order by e.recorded_at desc
  limit 1;

  if v_status = 'attended' then
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

notify pgrst, 'reload schema';

-- =============================================================================
-- 5) Never hard-delete attendance history (even via service_role)
-- =============================================================================

create or replace function public.tg_deny_attendance_event_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'attendance events are append-only'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists class_course_attendance_events_deny_delete
  on public.class_course_attendance_events;
create trigger class_course_attendance_events_deny_delete
  before delete on public.class_course_attendance_events
  for each row
  execute function public.tg_deny_attendance_event_delete();

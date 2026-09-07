-- 056: Fix ambiguous_column (42702) in create_class_schedule_day_with_sessions
--
-- Cause: RETURNS TABLE (day_id uuid, notify_revision integer) declares PL/pgSQL
-- output variables with those names. The INSERT used:
--   returning id, notify_revision into ...
-- where bare notify_revision is ambiguous (table column vs OUT variable).
--
-- This migration only REPLACE FUNCTION — no table/data changes.
-- Does not recreate the old 6-arg overload.
-- Keeps signature, return type, SECURITY DEFINER, search_path, and service_role-only EXECUTE.

create or replace function public.create_class_schedule_day_with_sessions(
  p_schedule_date date,
  p_venue_name text,
  p_address text,
  p_map_url text,
  p_room_note text,
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
  v_address text;
  v_map text;
  v_room text;
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
    select 1
    from public.profiles p
    where p.id = p_actor_id
      and p.role = 'admin'
  ) then
    raise exception 'permission denied: admin actor required'
      using errcode = '42501';
  end if;

  v_venue := trim(coalesce(p_venue_name, ''));
  if char_length(v_venue) = 0 or char_length(v_venue) > 200 then
    raise exception 'invalid venue_name'
      using errcode = '22023';
  end if;

  v_address := nullif(trim(coalesce(p_address, '')), '');
  if v_address is not null and char_length(v_address) > 500 then
    raise exception 'invalid address'
      using errcode = '22023';
  end if;

  v_map := nullif(trim(coalesce(p_map_url, '')), '');
  if v_map is not null then
    if char_length(v_map) > 2000 or v_map !~* '^https://' then
      raise exception 'invalid map_url'
        using errcode = '22023';
    end if;
  end if;

  v_room := nullif(trim(coalesce(p_room_note, '')), '');
  if v_room is not null and char_length(v_room) > 200 then
    raise exception 'invalid room_note'
      using errcode = '22023';
  end if;

  if p_sessions is null or jsonb_typeof(p_sessions) is distinct from 'array' then
    raise exception 'sessions must be a non-empty json array'
      using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_sessions);
  if v_count is null or v_count < 1 then
    raise exception 'at least one session is required'
      using errcode = '22023';
  end if;
  if v_count > 24 then
    raise exception 'too many sessions'
      using errcode = '22023';
  end if;

  -- Alias + qualified RETURNING avoids 42702 with RETURNS TABLE output names.
  insert into public.class_schedule_days as csd (
    schedule_date,
    venue_name,
    address,
    map_url,
    room_note,
    status,
    notify_revision,
    created_by,
    updated_by
  )
  values (
    p_schedule_date,
    v_venue,
    v_address,
    v_map,
    v_room,
    'scheduled',
    1,
    p_actor_id,
    p_actor_id
  )
  returning csd.id, csd.notify_revision
  into v_day_id, v_revision;

  perform 1
  from public.class_schedule_days d
  where d.id = v_day_id
  for update;

  for v_session in
    select je.value
    from jsonb_array_elements(p_sessions) as je(value)
  loop
    begin
      v_start := (v_session->>'start_time')::time;
      v_end := (v_session->>'end_time')::time;
    exception
      when others then
        raise exception 'invalid session time'
          using errcode = '22023';
    end;

    v_subject := trim(coalesce(v_session->>'subject', ''));
    if char_length(v_subject) = 0 or char_length(v_subject) > 100 then
      raise exception 'session subject is required'
        using errcode = '22023';
    end if;

    if v_end <= v_start then
      raise exception 'session end_time must be after start_time'
        using errcode = '22023';
    end if;

    v_note := nullif(trim(coalesce(v_session->>'note', '')), '');
    if v_note is not null and char_length(v_note) > 500 then
      raise exception 'invalid session note'
        using errcode = '22023';
    end if;

    insert into public.class_schedule_sessions as css (
      day_id,
      start_time,
      end_time,
      subject,
      note,
      status
    ) values (
      v_day_id,
      v_start,
      v_end,
      v_subject,
      v_note,
      'scheduled'
    );
  end loop;

  day_id := v_day_id;
  notify_revision := v_revision;
  return next;
end;
$$;

comment on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) is
  'service_role のみ EXECUTE。requireAdmin 後 Admin Client。p_actor_id は admin。コマ1〜24。RETURNING は alias 修飾（42702 回避）。';

revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) from public;
revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) from anon;
revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) from authenticated;
grant execute on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) to service_role;

-- Ensure old 6-arg overload stays absent (no-op if already dropped).
drop function if exists public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb);

notify pgrst, 'reload schema';

-- 057: class_schedule location_details + create RPC 5-arg
--
-- Adds location_details (free-text place info). Backfills from address / map_url /
-- room_note without dropping legacy columns.
-- Replaces create RPC (7-arg → 5-arg with p_location_details).
-- Does NOT bump notify_revision. No CASCADE drops. service_role-only EXECUTE.

-- 1) Column
alter table public.class_schedule_days
  add column if not exists location_details text;

comment on column public.class_schedule_days.location_details is
  '場所の詳細（任意・改行可）。住所・部屋・案内・https URL などを自由記述。旧 address/map_url/room_note の後継。';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'class_schedule_days_location_details_length'
      and conrelid = 'public.class_schedule_days'::regclass
  ) then
    alter table public.class_schedule_days
      add constraint class_schedule_days_location_details_length
      check (
        location_details is null
        or char_length(location_details) <= 2000
      );
  end if;
end;
$$;

-- 2) Backfill once (only where new column empty and legacy has content)
update public.class_schedule_days as csd
set location_details = nullif(
  trim(both E'\n' from concat_ws(
    E'\n',
    nullif(trim(both from coalesce(csd.address, '')), ''),
    nullif(trim(both from coalesce(csd.map_url, '')), ''),
    nullif(trim(both from coalesce(csd.room_note, '')), '')
  )),
  ''
)
where csd.location_details is null
  and (
    nullif(trim(both from coalesce(csd.address, '')), '') is not null
    or nullif(trim(both from coalesce(csd.map_url, '')), '') is not null
    or nullif(trim(both from coalesce(csd.room_note, '')), '') is not null
  );

-- 3) Create RPC: drop 7-arg, create 5-arg (no CASCADE)
drop function if exists public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid);
drop function if exists public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb);

create or replace function public.create_class_schedule_day_with_sessions(
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

  -- Preserve internal newlines; trim only outer whitespace.
  v_location := nullif(trim(both E'\n\r\t ' from coalesce(p_location_details, '')), '');
  if v_location is not null and char_length(v_location) > 2000 then
    raise exception 'invalid location_details'
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

  insert into public.class_schedule_days as csd (
    schedule_date,
    venue_name,
    location_details,
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
    v_location,
    null,
    null,
    null,
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
      day_id, start_time, end_time, subject, note, status
    ) values (
      v_day_id, v_start, v_end, v_subject, v_note, 'scheduled'
    );
  end loop;

  day_id := v_day_id;
  notify_revision := v_revision;
  return next;
end;
$$;

comment on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) is
  'service_role のみ。p_location_details 任意。旧3列は新規では null。コマ1〜24。';

revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) from public;
revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) from anon;
revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) from authenticated;
grant execute on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) to service_role;

notify pgrst, 'reload schema';

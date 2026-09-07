-- 057: class_schedule location_details + dual create RPC + session CHECKs
--
-- Zero-downtime bridge:
--   * Adds location_details and backfills from address / map_url / room_note
--   * Adds NEW 5-arg create RPC (p_location_details)
--   * KEEP and refresh 7-arg create RPC (compat for Production code still on 056)
--   * Does NOT DROP the 7-arg overload (cleanup is 058, after new app verified)
--   * Adds time-grid + subject CHECKs after aborting on bad existing rows
--   * Does NOT bump notify_revision. No CASCADE. No table DROP.
--
-- Apply order: see supabase/rollbacks/057_class_schedule_location_details_rollout.md

-- ---------------------------------------------------------------------------
-- 1) Column
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2) Backfill once (only where new column empty and legacy has content)
--    Order: address → map_url → room_note. Skip empties (no blank lines).
--    concat_ws skips NULLs; nullif(trim) collapses whitespace-only parts.
--    Re-run safe: WHERE location_details IS NULL.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3) Abort if existing session times / subjects cannot satisfy new CHECKs
--    (do not round or delete). Diagnostic: 057_*_precheck.sql
-- ---------------------------------------------------------------------------
do $$
declare
  v_bad_time integer;
  v_bad_subject integer;
begin
  select count(*)::integer into v_bad_time
  from public.class_schedule_sessions s
  where
    s.start_time < time '08:00'
    or s.start_time >= time '23:00'
    or s.end_time <= time '08:00'
    or s.end_time > time '23:00'
    or s.end_time <= s.start_time
    or (extract(epoch from s.start_time)::bigint % 300) <> 0
    or (extract(epoch from s.end_time)::bigint % 300) <> 0;

  if v_bad_time > 0 then
    raise exception
      '057 abort: class_schedule_sessions has % row(s) outside 08:00–23:00 5-minute grid (or end<=start). Run supabase/rollbacks/057_class_schedule_location_details_precheck.sql — do not round/delete automatically.',
      v_bad_time;
  end if;

  select count(*)::integer into v_bad_subject
  from public.class_schedule_sessions s
  where
    char_length(trim(s.subject)) = 0
    or char_length(trim(s.subject)) > 100
    or s.subject ~ '[[:cntrl:]]';

  if v_bad_subject > 0 then
    raise exception
      '057 abort: class_schedule_sessions has % row(s) with invalid subject (blank/trim-empty, >100 chars, or control chars). Run supabase/rollbacks/057_class_schedule_location_details_precheck.sql.',
      v_bad_subject;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Session CHECKs (time grid + subject). Keep overlap trigger / end>start.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'class_schedule_sessions_time_grid'
      and conrelid = 'public.class_schedule_sessions'::regclass
  ) then
    alter table public.class_schedule_sessions
      add constraint class_schedule_sessions_time_grid
      check (
        start_time >= time '08:00'
        and start_time < time '23:00'
        and end_time > time '08:00'
        and end_time <= time '23:00'
        and end_time > start_time
        and (extract(epoch from start_time)::bigint % 300) = 0
        and (extract(epoch from end_time)::bigint % 300) = 0
      );
  end if;

  -- Replace weak nonempty-only check with trim/length/control rules.
  if exists (
    select 1 from pg_constraint
    where conname = 'class_schedule_sessions_subject_nonempty'
      and conrelid = 'public.class_schedule_sessions'::regclass
  ) then
    alter table public.class_schedule_sessions
      drop constraint class_schedule_sessions_subject_nonempty;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'class_schedule_sessions_subject_valid'
      and conrelid = 'public.class_schedule_sessions'::regclass
  ) then
    alter table public.class_schedule_sessions
      add constraint class_schedule_sessions_subject_valid
      check (
        char_length(trim(subject)) > 0
        and char_length(trim(subject)) <= 100
        and subject !~ '[[:cntrl:]]'
      );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Compat 7-arg RPC (Production app until new deploy). Writes location_details
--    from legacy fields so new column is never left empty when place info exists.
--    Keeps 42702-safe RETURNING. service_role only.
-- ---------------------------------------------------------------------------
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

  -- Same join rules as column backfill (no empty lines / no duplicate blanks).
  v_location := nullif(
    trim(both E'\n' from concat_ws(E'\n', v_address, v_map, v_room)),
    ''
  );
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
    if v_subject ~ '[[:cntrl:]]' then
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
  'COMPAT (pre-058). service_role のみ。旧3項目を受け取り location_details も同時保存。42702 回避 RETURNING。新アプリ確認後に 058 で削除。';

revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) from public;
revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) from anon;
revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) from authenticated;
grant execute on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) to service_role;

-- Ensure old 6-arg overload stays absent (no-op if already dropped). Do NOT drop 7-arg.
drop function if exists public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb);

-- ---------------------------------------------------------------------------
-- 6) New 5-arg RPC (new app). Does not DROP 7-arg.
-- ---------------------------------------------------------------------------
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
    if v_subject ~ '[[:cntrl:]]' then
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
  'service_role のみ。p_location_details 任意。旧3列は新規では null。コマ1〜24。42702 回避 RETURNING。';

revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) from public;
revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) from anon;
revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) from authenticated;
grant execute on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) to service_role;

notify pgrst, 'reload schema';

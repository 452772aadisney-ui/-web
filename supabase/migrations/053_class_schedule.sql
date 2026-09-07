-- 既卒生 授業予定（class_schedule_days / class_schedule_sessions）
-- Supabase Dashboard > SQL Editor で実行してください
--
-- 依存: profiles, is_admin(), handle_updated_at(), profile_student_tags / student_tags（学年=既卒）
-- 適用順: 必ず 053 → 054。rollback は 054 → 053。
-- 通知カテゴリ・配信は 054。notify_revision は通知冪等用。
-- 新規登録は create_class_schedule_day_with_sessions で日+コマを同一トランザクション保存（コマ1件以上必須）。
--
-- 再実行安全（テーブル・データは DROP しない）:
-- 1) 旧 is_kisotsu_profile(uuid) を参照し得るポリシーを明示 DROP
-- 2) 旧 uuid 関数を DROP（CASCADE なし）
-- 3) 引数なし is_kisotsu_profile() を作成
-- 4) テーブル IF NOT EXISTS → ポリシー再作成（引数なし関数参照）
--
-- 本番が旧053部分適用の場合は本ファイルを再実行せず、055_repair_... を適用する。
-- 新規環境: 053 → 054 → 055。

-- ---------------------------------------------------------------------------
-- 0) 旧 uuid 関数を参照し得るポリシーを先に外す（部分適用からの再実行用）
--    テーブルが無い空DBでは何もしない。データは削除しない。
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.class_schedule_days') is not null then
    drop policy if exists "class_schedule_days_select" on public.class_schedule_days;
    drop policy if exists "class_schedule_days_insert_admin" on public.class_schedule_days;
    drop policy if exists "class_schedule_days_update_admin" on public.class_schedule_days;
    drop policy if exists "class_schedule_days_delete_admin" on public.class_schedule_days;
  end if;

  if to_regclass('public.class_schedule_sessions') is not null then
    drop policy if exists "class_schedule_sessions_select" on public.class_schedule_sessions;
    drop policy if exists "class_schedule_sessions_insert_admin" on public.class_schedule_sessions;
    drop policy if exists "class_schedule_sessions_update_admin" on public.class_schedule_sessions;
    drop policy if exists "class_schedule_sessions_delete_admin" on public.class_schedule_sessions;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Helper: 呼び出し元が既卒か（auth.uid() 固定・偽装不可）
-- ---------------------------------------------------------------------------

-- 依存ポリシーは上で除去済み。CASCADE は使わない。
drop function if exists public.is_kisotsu_profile(uuid);

create or replace function public.is_kisotsu_profile()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profile_student_tags pst
    inner join public.student_tags st on st.id = pst.tag_id
    where pst.profile_id = auth.uid()
      and st.category = '学年'
      and st.name = '既卒'
  );
$$;

comment on function public.is_kisotsu_profile() is
  '呼び出し元 auth.uid() が学年タグ「既卒」を持つか。RLS 用（security definer）。引数なしで UUID プローブ不可。';

revoke all on function public.is_kisotsu_profile() from public;
revoke all on function public.is_kisotsu_profile() from anon;
grant execute on function public.is_kisotsu_profile() to authenticated;
-- service_role はデフォルトで実行可。明示付与で verify を安定させる
grant execute on function public.is_kisotsu_profile() to service_role;

-- ---------------------------------------------------------------------------
-- 2) class_schedule_days
-- ---------------------------------------------------------------------------

create table if not exists public.class_schedule_days (
  id uuid primary key default gen_random_uuid(),
  schedule_date date not null,
  venue_name text not null,
  address text,
  map_url text,
  room_note text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled')),
  notify_revision integer not null default 0 check (notify_revision >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_schedule_days_schedule_date_unique unique (schedule_date),
  constraint class_schedule_days_venue_name_nonempty
    check (char_length(trim(venue_name)) > 0),
  constraint class_schedule_days_map_url_https
    check (
      map_url is null
      or char_length(trim(map_url)) = 0
      or map_url ~* '^https://'
    )
);

comment on table public.class_schedule_days is '既卒生向け授業日（会場・日付単位）';
comment on column public.class_schedule_days.notify_revision is
  '通知再送用リビジョン。本コミットでは未使用（後続で増分）。';
comment on column public.class_schedule_days.map_url is '地図リンク。設定時は https のみ。';

create index if not exists class_schedule_days_schedule_date_idx
  on public.class_schedule_days (schedule_date desc);

create index if not exists class_schedule_days_status_date_idx
  on public.class_schedule_days (status, schedule_date);

drop trigger if exists class_schedule_days_updated_at on public.class_schedule_days;
create trigger class_schedule_days_updated_at
  before update on public.class_schedule_days
  for each row execute function public.handle_updated_at();

alter table public.class_schedule_days enable row level security;

drop policy if exists "class_schedule_days_select" on public.class_schedule_days;
create policy "class_schedule_days_select"
  on public.class_schedule_days for select
  to authenticated
  using (public.is_admin() or public.is_kisotsu_profile());

drop policy if exists "class_schedule_days_insert_admin" on public.class_schedule_days;
create policy "class_schedule_days_insert_admin"
  on public.class_schedule_days for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "class_schedule_days_update_admin" on public.class_schedule_days;
create policy "class_schedule_days_update_admin"
  on public.class_schedule_days for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "class_schedule_days_delete_admin" on public.class_schedule_days;
create policy "class_schedule_days_delete_admin"
  on public.class_schedule_days for delete
  to authenticated
  using (public.is_admin());

grant select, insert, update, delete on table public.class_schedule_days to authenticated;

-- ---------------------------------------------------------------------------
-- 3) class_schedule_sessions
-- ---------------------------------------------------------------------------

create table if not exists public.class_schedule_sessions (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.class_schedule_days (id) on delete cascade,
  start_time time not null,
  end_time time not null,
  subject text not null,
  note text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_schedule_sessions_end_after_start
    check (end_time > start_time),
  constraint class_schedule_sessions_subject_nonempty
    check (char_length(trim(subject)) > 0)
);

comment on table public.class_schedule_sessions is '既卒生向け授業コマ（日に紐づく科目・時間帯）';
comment on column public.class_schedule_sessions.note is '生徒に表示する任意メモ';

create index if not exists class_schedule_sessions_day_id_idx
  on public.class_schedule_sessions (day_id, start_time);

drop trigger if exists class_schedule_sessions_updated_at on public.class_schedule_sessions;
create trigger class_schedule_sessions_updated_at
  before update on public.class_schedule_sessions
  for each row execute function public.handle_updated_at();

-- 同日の scheduled コマ同士の時間重複を禁止（端点接触は許可・半開区間）
-- 親日行を FOR UPDATE でロックし、同時 INSERT/UPDATE の競合を直列化する
create or replace function public.class_schedule_sessions_reject_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from 'scheduled' then
    return new;
  end if;

  -- Serialize mutations for this day (prevents SELECT-only race under READ COMMITTED)
  perform 1
  from public.class_schedule_days d
  where d.id = new.day_id
  for update;

  if not found then
    raise exception 'class_schedule_day not found for session'
      using errcode = '23503';
  end if;

  if exists (
    select 1
    from public.class_schedule_sessions s
    where s.day_id = new.day_id
      and s.status = 'scheduled'
      and (tg_op = 'INSERT' or s.id is distinct from new.id)
      and s.start_time < new.end_time
      and new.start_time < s.end_time
  ) then
    raise exception 'overlapping scheduled class_schedule_sessions on the same day'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists class_schedule_sessions_overlap_check
  on public.class_schedule_sessions;
create trigger class_schedule_sessions_overlap_check
  before insert or update of day_id, start_time, end_time, status
  on public.class_schedule_sessions
  for each row execute function public.class_schedule_sessions_reject_overlap();

alter table public.class_schedule_sessions enable row level security;

drop policy if exists "class_schedule_sessions_select" on public.class_schedule_sessions;
create policy "class_schedule_sessions_select"
  on public.class_schedule_sessions for select
  to authenticated
  using (public.is_admin() or public.is_kisotsu_profile());

drop policy if exists "class_schedule_sessions_insert_admin" on public.class_schedule_sessions;
create policy "class_schedule_sessions_insert_admin"
  on public.class_schedule_sessions for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "class_schedule_sessions_update_admin" on public.class_schedule_sessions;
create policy "class_schedule_sessions_update_admin"
  on public.class_schedule_sessions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "class_schedule_sessions_delete_admin" on public.class_schedule_sessions;
create policy "class_schedule_sessions_delete_admin"
  on public.class_schedule_sessions for delete
  to authenticated
  using (public.is_admin());

grant select, insert, update, delete on table public.class_schedule_sessions to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Atomic create / bump RPCs（service_role のみ）
-- ---------------------------------------------------------------------------

drop function if exists public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb);
drop function if exists public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid);

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
  -- Authenticated/anon cannot EXECUTE; still refuse non-service callers in-body.
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

  -- Qualify RETURNING columns: RETURNS TABLE exposes notify_revision/day_id as
  -- PL/pgSQL variables, so bare "returning ..., notify_revision" raises 42702.
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

  perform 1 from public.class_schedule_days d where d.id = v_day_id for update;

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

comment on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) is
  'service_role のみ EXECUTE。アプリは requireAdmin 後に Admin Client から呼ぶ。作成者は p_actor_id（admin profiles 必須）。コマ1〜24件。失敗時は全体ロールバック。RETURNING は alias 修飾（42702 回避）。';

revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) from public;
revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) from anon;
revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) from authenticated;
grant execute on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) to service_role;

-- Atomic notify_revision bump（service_role のみ。生徒は EXECUTE 不可）
create or replace function public.bump_class_schedule_notify_revision(
  p_day_id uuid,
  p_updated_by uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'permission denied: service_role only'
      using errcode = '42501';
  end if;

  if p_day_id is null or p_updated_by is null then
    raise exception 'day id and updated_by are required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_updated_by
      and p.role = 'admin'
  ) then
    raise exception 'permission denied: admin actor required'
      using errcode = '42501';
  end if;

  update public.class_schedule_days
  set
    notify_revision = notify_revision + 1,
    updated_by = p_updated_by,
    updated_at = now()
  where id = p_day_id
  returning notify_revision into v_revision;

  if v_revision is null then
    -- Do not distinguish missing vs unauthorized to callers without EXECUTE;
    -- service_role only reaches here.
    raise exception 'class_schedule_day not found'
      using errcode = 'P0002';
  end if;

  return v_revision;
end;
$$;

comment on function public.bump_class_schedule_notify_revision(uuid, uuid) is
  'service_role のみ EXECUTE。notify_revision を原子的に +1。p_updated_by は admin profiles 必須。アプリの重要変更処理からのみ呼ぶ。';

revoke all on function public.bump_class_schedule_notify_revision(uuid, uuid) from public;
revoke all on function public.bump_class_schedule_notify_revision(uuid, uuid) from anon;
revoke all on function public.bump_class_schedule_notify_revision(uuid, uuid) from authenticated;
grant execute on function public.bump_class_schedule_notify_revision(uuid, uuid) to service_role;

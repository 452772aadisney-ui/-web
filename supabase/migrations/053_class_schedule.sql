-- 既卒生 授業予定（class_schedule_days / class_schedule_sessions）
-- Supabase Dashboard > SQL Editor で実行してください
--
-- 依存: profiles, is_admin(), handle_updated_at(), profile_student_tags / student_tags（学年=既卒）
-- 適用順: 必ず 053 → 054。rollback は 054 → 053。
-- 通知カテゴリ・配信は 054。notify_revision は通知冪等用。
-- 新規登録は create_class_schedule_day_with_sessions で日+コマを同一トランザクション保存（コマ1件以上必須）。

-- ---------------------------------------------------------------------------
-- Helper: 既卒タグを持つプロフィールか
-- ---------------------------------------------------------------------------

create or replace function public.is_kisotsu_profile(p_uid uuid)
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
    where pst.profile_id = p_uid
      and st.category = '学年'
      and st.name = '既卒'
  );
$$;

comment on function public.is_kisotsu_profile(uuid) is
  '指定プロフィールが学年タグ「既卒」を持つか。RLS 用（security definer）。ポリシーは必ず is_kisotsu_profile(auth.uid()) で呼ぶ。';

-- 任意 UUID の既卒判定プローブを防ぐ（RLS は auth.uid() 経由のみ想定）
revoke all on function public.is_kisotsu_profile(uuid) from public;
grant execute on function public.is_kisotsu_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- class_schedule_days
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
  using (public.is_admin() or public.is_kisotsu_profile(auth.uid()));

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
-- class_schedule_sessions
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
  using (public.is_admin() or public.is_kisotsu_profile(auth.uid()));

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
-- Atomic create: 授業日 + 初期コマ（1件以上）を同一トランザクションで保存
-- ---------------------------------------------------------------------------

create or replace function public.create_class_schedule_day_with_sessions(
  p_schedule_date date,
  p_venue_name text,
  p_address text,
  p_map_url text,
  p_room_note text,
  p_sessions jsonb
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
begin
  if not public.is_admin() then
    raise exception 'permission denied: admin only'
      using errcode = '42501';
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

  insert into public.class_schedule_days (
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
    p_venue_name,
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_map_url, '')), ''),
    nullif(trim(coalesce(p_room_note, '')), ''),
    'scheduled',
    1,
    auth.uid(),
    auth.uid()
  )
  returning id, notify_revision
  into v_day_id, v_revision;

  -- Serialize with overlap trigger locking this day
  perform 1 from public.class_schedule_days d where d.id = v_day_id for update;

  for v_session in
    select value from jsonb_array_elements(p_sessions)
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
    if char_length(v_subject) = 0 then
      raise exception 'session subject is required'
        using errcode = '22023';
    end if;

    if v_end <= v_start then
      raise exception 'session end_time must be after start_time'
        using errcode = '22023';
    end if;

    v_note := nullif(trim(coalesce(v_session->>'note', '')), '');

    insert into public.class_schedule_sessions (
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

comment on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb) is
  '管理者のみ。授業日と初期コマを同一トランザクションで作成。コマ0件は拒否。失敗時は全体ロールバック。';

revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb) from public;
grant execute on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb) to authenticated;

-- Atomic notify_revision bump（同時更新でも重複 revision を避ける）
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
  if not public.is_admin() then
    raise exception 'permission denied: admin only'
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
    raise exception 'class_schedule_day not found'
      using errcode = 'P0002';
  end if;

  return v_revision;
end;
$$;

comment on function public.bump_class_schedule_notify_revision(uuid, uuid) is
  '管理者のみ。notify_revision を原子的に +1 して返す。';

revoke all on function public.bump_class_schedule_notify_revision(uuid, uuid) from public;
grant execute on function public.bump_class_schedule_notify_revision(uuid, uuid) to authenticated;

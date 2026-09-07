-- 055: 授業予定 部分適用の安全な正規化（本番向け修復）
-- Supabase Dashboard > SQL Editor で実行してください
--
-- 背景:
--   本番は旧053・054が部分適用済み。テーブル／データは保持したまま最終状態へ収束させる。
--   修正版053・054は「新規環境向け完全版」として維持する。
--   本番では 053・054 を再実行せず、本055のみを適用する。
--
-- 新規環境:
--   053 → 054 → 055 の順でも冪等に成功する（既に正しい状態なら実質 no-op）。
--
-- 禁止: DROP TABLE、データDELETE、DROP ... CASCADE
-- 失敗時: 同一スクリプトを1トランザクションで実行すれば全体rollback（ポリシーだけ消えたまま残さない）

-- ---------------------------------------------------------------------------
-- 0) 前提: テーブルが無ければ中断（空DBは先に053を適用）
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.class_schedule_days') is null
     or to_regclass('public.class_schedule_sessions') is null then
    raise exception
      '055_repair_class_schedule_partial_migration requires class_schedule_days/sessions. Apply 053 first on empty DBs.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0b) 既存データの健全性検査（勝手に補正しない。不正なら中断）
-- ---------------------------------------------------------------------------

do $$
declare
  v_bad integer;
begin
  select count(*)::int into v_bad
  from public.class_schedule_days d
  where d.status is distinct from 'scheduled'
    and d.status is distinct from 'cancelled';
  if v_bad > 0 then
    raise exception '055 abort: class_schedule_days has % row(s) with invalid status', v_bad;
  end if;

  select count(*)::int into v_bad
  from public.class_schedule_sessions s
  where s.status is distinct from 'scheduled'
    and s.status is distinct from 'cancelled';
  if v_bad > 0 then
    raise exception '055 abort: class_schedule_sessions has % row(s) with invalid status', v_bad;
  end if;

  select count(*)::int into v_bad
  from public.class_schedule_sessions s
  where s.end_time <= s.start_time;
  if v_bad > 0 then
    raise exception '055 abort: class_schedule_sessions has % row(s) with end_time <= start_time', v_bad;
  end if;

  select count(*)::int into v_bad
  from public.class_schedule_days d
  where d.map_url is not null
    and char_length(trim(d.map_url)) > 0
    and d.map_url !~* '^https://';
  if v_bad > 0 then
    raise exception '055 abort: class_schedule_days has % row(s) with non-https map_url', v_bad;
  end if;

  select count(*)::int into v_bad
  from public.class_schedule_days d
  where char_length(trim(d.venue_name)) = 0;
  if v_bad > 0 then
    raise exception '055 abort: class_schedule_days has % row(s) with empty venue_name', v_bad;
  end if;

  select count(*)::int into v_bad
  from public.class_schedule_sessions s
  where char_length(trim(s.subject)) = 0;
  if v_bad > 0 then
    raise exception '055 abort: class_schedule_sessions has % row(s) with empty subject', v_bad;
  end if;

  -- scheduled 同士の半開区間重複
  select count(*)::int into v_bad
  from public.class_schedule_sessions a
  join public.class_schedule_sessions b
    on a.day_id = b.day_id
   and a.id < b.id
   and a.status = 'scheduled'
   and b.status = 'scheduled'
   and a.start_time < b.end_time
   and b.start_time < a.end_time;
  if v_bad > 0 then
    raise exception '055 abort: found % overlapping scheduled session pair(s)', v_bad;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) 旧 is_kisotsu_profile(uuid) 依存ポリシーを明示 DROP → uuid 関数 DROP
--    → 引数なし関数作成 → ポリシー再作成（同一トランザクション想定）
-- ---------------------------------------------------------------------------

drop policy if exists "class_schedule_days_select" on public.class_schedule_days;
drop policy if exists "class_schedule_days_insert_admin" on public.class_schedule_days;
drop policy if exists "class_schedule_days_update_admin" on public.class_schedule_days;
drop policy if exists "class_schedule_days_delete_admin" on public.class_schedule_days;

drop policy if exists "class_schedule_sessions_select" on public.class_schedule_sessions;
drop policy if exists "class_schedule_sessions_insert_admin" on public.class_schedule_sessions;
drop policy if exists "class_schedule_sessions_update_admin" on public.class_schedule_sessions;
drop policy if exists "class_schedule_sessions_delete_admin" on public.class_schedule_sessions;

-- CASCADE 禁止。依存ポリシーは上で除去済み。
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
  '呼び出し元 auth.uid() が学年タグ「既卒」を持つか。RLS 用。引数なしで UUID プローブ不可。';

revoke all on function public.is_kisotsu_profile() from public;
revoke all on function public.is_kisotsu_profile() from anon;
grant execute on function public.is_kisotsu_profile() to authenticated;
grant execute on function public.is_kisotsu_profile() to service_role;

-- ---------------------------------------------------------------------------
-- 2) テーブル構造の正規化（列・制約・index・trigger。テーブル/データは DROP しない）
-- ---------------------------------------------------------------------------

-- days 不足列
alter table public.class_schedule_days
  add column if not exists schedule_date date,
  add column if not exists venue_name text,
  add column if not exists address text,
  add column if not exists map_url text,
  add column if not exists room_note text,
  add column if not exists status text,
  add column if not exists notify_revision integer,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

-- 列既定値・NOT NULL（既存行がある場合に失敗し得るものは検査済み）
do $$
begin
  -- status default / not null
  update public.class_schedule_days set status = 'scheduled' where status is null;
  alter table public.class_schedule_days
    alter column status set default 'scheduled';
  alter table public.class_schedule_days
    alter column status set not null;

  update public.class_schedule_days set notify_revision = 0 where notify_revision is null;
  alter table public.class_schedule_days
    alter column notify_revision set default 0;
  alter table public.class_schedule_days
    alter column notify_revision set not null;

  update public.class_schedule_days set created_at = now() where created_at is null;
  alter table public.class_schedule_days
    alter column created_at set default now();
  alter table public.class_schedule_days
    alter column created_at set not null;

  update public.class_schedule_days set updated_at = now() where updated_at is null;
  alter table public.class_schedule_days
    alter column updated_at set default now();
  alter table public.class_schedule_days
    alter column updated_at set not null;

  -- schedule_date / venue_name must be present
  if exists (
    select 1 from public.class_schedule_days
    where schedule_date is null or venue_name is null
  ) then
    raise exception '055 abort: class_schedule_days has null schedule_date or venue_name';
  end if;
  alter table public.class_schedule_days alter column schedule_date set not null;
  alter table public.class_schedule_days alter column venue_name set not null;
end $$;

-- days constraints（無ければ追加）
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'class_schedule_days_schedule_date_unique'
  ) then
    alter table public.class_schedule_days
      add constraint class_schedule_days_schedule_date_unique unique (schedule_date);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'class_schedule_days_venue_name_nonempty'
  ) then
    alter table public.class_schedule_days
      add constraint class_schedule_days_venue_name_nonempty
      check (char_length(trim(venue_name)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'class_schedule_days_map_url_https'
  ) then
    alter table public.class_schedule_days
      add constraint class_schedule_days_map_url_https
      check (
        map_url is null
        or char_length(trim(map_url)) = 0
        or map_url ~* '^https://'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'class_schedule_days_status_check'
       or conname like '%class_schedule_days%status%'
  ) then
    -- inline check may already exist with auto name; add named if missing
    begin
      alter table public.class_schedule_days
        add constraint class_schedule_days_status_check
        check (status in ('scheduled', 'cancelled'));
    exception
      when duplicate_object then null;
      when check_violation then
        raise exception '055 abort: cannot add status check due to existing bad data';
    end;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'class_schedule_days_notify_revision_check'
  ) then
    begin
      alter table public.class_schedule_days
        add constraint class_schedule_days_notify_revision_check
        check (notify_revision >= 0);
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

-- FK created_by / updated_by（無ければ）
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'class_schedule_days_created_by_fkey'
  ) then
    alter table public.class_schedule_days
      add constraint class_schedule_days_created_by_fkey
      foreign key (created_by) references public.profiles (id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'class_schedule_days_updated_by_fkey'
  ) then
    alter table public.class_schedule_days
      add constraint class_schedule_days_updated_by_fkey
      foreign key (updated_by) references public.profiles (id) on delete set null;
  end if;
end $$;

create index if not exists class_schedule_days_schedule_date_idx
  on public.class_schedule_days (schedule_date desc);
create index if not exists class_schedule_days_status_date_idx
  on public.class_schedule_days (status, schedule_date);

drop trigger if exists class_schedule_days_updated_at on public.class_schedule_days;
create trigger class_schedule_days_updated_at
  before update on public.class_schedule_days
  for each row execute function public.handle_updated_at();

alter table public.class_schedule_days enable row level security;

-- sessions 列
alter table public.class_schedule_sessions
  add column if not exists day_id uuid,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists subject text,
  add column if not exists note text,
  add column if not exists status text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

do $$
begin
  update public.class_schedule_sessions set status = 'scheduled' where status is null;
  alter table public.class_schedule_sessions alter column status set default 'scheduled';
  alter table public.class_schedule_sessions alter column status set not null;

  update public.class_schedule_sessions set created_at = now() where created_at is null;
  alter table public.class_schedule_sessions alter column created_at set default now();
  alter table public.class_schedule_sessions alter column created_at set not null;

  update public.class_schedule_sessions set updated_at = now() where updated_at is null;
  alter table public.class_schedule_sessions alter column updated_at set default now();
  alter table public.class_schedule_sessions alter column updated_at set not null;

  if exists (
    select 1 from public.class_schedule_sessions
    where day_id is null or start_time is null or end_time is null or subject is null
  ) then
    raise exception '055 abort: class_schedule_sessions has null required fields';
  end if;
  alter table public.class_schedule_sessions alter column day_id set not null;
  alter table public.class_schedule_sessions alter column start_time set not null;
  alter table public.class_schedule_sessions alter column end_time set not null;
  alter table public.class_schedule_sessions alter column subject set not null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'class_schedule_sessions_day_id_fkey'
  ) then
    alter table public.class_schedule_sessions
      add constraint class_schedule_sessions_day_id_fkey
      foreign key (day_id) references public.class_schedule_days (id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'class_schedule_sessions_end_after_start'
  ) then
    alter table public.class_schedule_sessions
      add constraint class_schedule_sessions_end_after_start
      check (end_time > start_time);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'class_schedule_sessions_subject_nonempty'
  ) then
    alter table public.class_schedule_sessions
      add constraint class_schedule_sessions_subject_nonempty
      check (char_length(trim(subject)) > 0);
  end if;

  begin
    alter table public.class_schedule_sessions
      add constraint class_schedule_sessions_status_check
      check (status in ('scheduled', 'cancelled'));
  exception
    when duplicate_object then null;
  end;
end $$;

create index if not exists class_schedule_sessions_day_id_idx
  on public.class_schedule_sessions (day_id, start_time);

drop trigger if exists class_schedule_sessions_updated_at on public.class_schedule_sessions;
create trigger class_schedule_sessions_updated_at
  before update on public.class_schedule_sessions
  for each row execute function public.handle_updated_at();

-- overlap trigger（親日 FOR UPDATE + search_path）
create or replace function public.class_schedule_sessions_reject_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from 'scheduled' then
    return new;
  end if;

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

-- ポリシー再作成（引数なし is_kisotsu_profile()）
create policy "class_schedule_days_select"
  on public.class_schedule_days for select
  to authenticated
  using (public.is_admin() or public.is_kisotsu_profile());

create policy "class_schedule_days_insert_admin"
  on public.class_schedule_days for insert
  to authenticated
  with check (public.is_admin());

create policy "class_schedule_days_update_admin"
  on public.class_schedule_days for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "class_schedule_days_delete_admin"
  on public.class_schedule_days for delete
  to authenticated
  using (public.is_admin());

create policy "class_schedule_sessions_select"
  on public.class_schedule_sessions for select
  to authenticated
  using (public.is_admin() or public.is_kisotsu_profile());

create policy "class_schedule_sessions_insert_admin"
  on public.class_schedule_sessions for insert
  to authenticated
  with check (public.is_admin());

create policy "class_schedule_sessions_update_admin"
  on public.class_schedule_sessions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "class_schedule_sessions_delete_admin"
  on public.class_schedule_sessions for delete
  to authenticated
  using (public.is_admin());

grant select, insert, update, delete on table public.class_schedule_days to authenticated;
grant select, insert, update, delete on table public.class_schedule_sessions to authenticated;

-- ---------------------------------------------------------------------------
-- 3) 作成 RPC: 新7引数を用意 → 旧6引数を DROP（最終は7引数のみ）
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

  -- Qualify RETURNING columns: RETURNS TABLE exposes notify_revision/day_id as
  -- PL/pgSQL variables, so bare "returning ..., notify_revision" raises 42702.
  insert into public.class_schedule_days as csd (
    schedule_date, venue_name, address, map_url, room_note,
    status, notify_revision, created_by, updated_by
  )
  values (
    p_schedule_date, v_venue, v_address, v_map, v_room,
    'scheduled', 1, p_actor_id, p_actor_id
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
  'service_role のみ。requireAdmin 後 Admin Client から呼ぶ。p_actor_id は admin。コマ1〜24。RETURNING は alias 修飾（42702 回避）。';

revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) from public;
revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) from anon;
revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) from authenticated;
grant execute on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) to service_role;

-- 旧6引数版を最終状態から除去（存在しなければ no-op）
drop function if exists public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb);

-- ---------------------------------------------------------------------------
-- 4) revision RPC（CREATE OR REPLACE + service_role のみ GRANT）
-- ---------------------------------------------------------------------------

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
    raise exception 'class_schedule_day not found'
      using errcode = 'P0002';
  end if;

  return v_revision;
end;
$$;

comment on function public.bump_class_schedule_notify_revision(uuid, uuid) is
  'service_role のみ。notify_revision を原子的に +1。p_updated_by は admin。';

revoke all on function public.bump_class_schedule_notify_revision(uuid, uuid) from public;
revoke all on function public.bump_class_schedule_notify_revision(uuid, uuid) from anon;
revoke all on function public.bump_class_schedule_notify_revision(uuid, uuid) from authenticated;
grant execute on function public.bump_class_schedule_notify_revision(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5) 054 部分適用の正規化（不足分のみ。既存 false は触らない）
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'push_notification_type'
      and e.enumlabel = 'class_schedule'
  ) then
    alter type public.push_notification_type add value 'class_schedule';
  end if;
end $$;

alter table public.notification_preferences
  add column if not exists class_schedule boolean not null default true;

-- NOT NULL / DEFAULT を維持（既存 false は UPDATE しない）
do $$
begin
  alter table public.notification_preferences
    alter column class_schedule set default true;
  alter table public.notification_preferences
    alter column class_schedule set not null;
exception
  when others then
    raise exception '055 abort: cannot enforce notification_preferences.class_schedule NOT NULL/DEFAULT: %', sqlerrm;
end $$;

comment on column public.notification_preferences.class_schedule is
  '既卒授業予定の登録・変更・中止（管理者制御）。true=Push-first（不可時メールfallback）、false=Push・メール両方停止。';

alter table public.notification_preference_changes
  drop constraint if exists notification_preference_changes_category_check;

alter table public.notification_preference_changes
  add constraint notification_preference_changes_category_check
  check (
    category in (
      'study_reminder',
      'announcement',
      'message',
      'coaching_reminder',
      'class_schedule'
    )
  );

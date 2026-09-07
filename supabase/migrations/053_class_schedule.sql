-- 既卒生 授業予定（class_schedule_days / class_schedule_sessions）
-- Supabase Dashboard > SQL Editor で実行してください
--
-- 通知カテゴリ・配信は後続コミット。notify_revision は通知用の予備カラム。

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
  '指定プロフィールが学年タグ「既卒」を持つか。RLS 用（security definer）。';

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

-- 同日の scheduled コマ同士の時間重複を禁止（端点接触は許可）
create or replace function public.class_schedule_sessions_reject_overlap()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from 'scheduled' then
    return new;
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

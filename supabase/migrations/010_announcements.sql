-- お知らせ / 既読管理
-- Supabase Dashboard > SQL Editor で実行してください

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.announcements is '管理者からのお知らせ';

create index if not exists announcements_created_at_idx
  on public.announcements (created_at desc);

create table if not exists public.announcement_reads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (student_id, announcement_id)
);

comment on table public.announcement_reads is '生徒ごとのお知らせ既読記録';

create index if not exists announcement_reads_announcement_idx
  on public.announcement_reads (announcement_id);

create index if not exists announcement_reads_student_idx
  on public.announcement_reads (student_id);

drop trigger if exists announcements_updated_at on public.announcements;
create trigger announcements_updated_at
  before update on public.announcements
  for each row execute function public.handle_updated_at();

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;

drop policy if exists "announcements_select_all" on public.announcements;
create policy "announcements_select_all"
  on public.announcements for select to authenticated using (true);

drop policy if exists "announcements_insert_admin" on public.announcements;
create policy "announcements_insert_admin"
  on public.announcements for insert to authenticated
  with check (public.is_admin());

drop policy if exists "announcements_update_admin" on public.announcements;
create policy "announcements_update_admin"
  on public.announcements for update to authenticated
  using (public.is_admin());

drop policy if exists "announcements_delete_admin" on public.announcements;
create policy "announcements_delete_admin"
  on public.announcements for delete to authenticated
  using (public.is_admin());

drop policy if exists "announcement_reads_select" on public.announcement_reads;
create policy "announcement_reads_select"
  on public.announcement_reads for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

drop policy if exists "announcement_reads_insert_own" on public.announcement_reads;
create policy "announcement_reads_insert_own"
  on public.announcement_reads for insert to authenticated
  with check (student_id = auth.uid());

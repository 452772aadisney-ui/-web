-- 生徒タグ / お知らせ配信先
-- Supabase Dashboard > SQL Editor で実行してください

create table if not exists public.student_tags (
  id uuid primary key default gen_random_uuid(),
  category text not null default '',
  name text not null,
  created_at timestamptz not null default now(),
  unique (category, name)
);

comment on table public.student_tags is '生徒タグのマスタ（学年・系統など）';

create table if not exists public.profile_student_tags (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tag_id uuid not null references public.student_tags (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (profile_id, tag_id)
);

comment on table public.profile_student_tags is '生徒に付与されたタグ';

create index if not exists profile_student_tags_profile_idx
  on public.profile_student_tags (profile_id);

create index if not exists profile_student_tags_tag_idx
  on public.profile_student_tags (tag_id);

alter table public.announcements
  add column if not exists target_all boolean not null default false;

-- 既存のお知らせは全員配信として扱う
update public.announcements set target_all = true where target_all = false;

create table if not exists public.announcement_target_tags (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  tag_id uuid not null references public.student_tags (id) on delete cascade,
  primary key (announcement_id, tag_id)
);

create table if not exists public.announcement_target_students (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  primary key (announcement_id, student_id)
);

-- 初期タグ（重複時は無視）
insert into public.student_tags (category, name) values
  ('学年', '高1'),
  ('学年', '高2'),
  ('学年', '高3'),
  ('系統', '文系'),
  ('系統', '理系')
on conflict (category, name) do nothing;

alter table public.student_tags enable row level security;
alter table public.profile_student_tags enable row level security;
alter table public.announcement_target_tags enable row level security;
alter table public.announcement_target_students enable row level security;

-- タグマスタ: 認証済みは閲覧、管理者のみ CRUD
drop policy if exists "student_tags_select_all" on public.student_tags;
create policy "student_tags_select_all"
  on public.student_tags for select to authenticated using (true);

drop policy if exists "student_tags_insert_admin" on public.student_tags;
create policy "student_tags_insert_admin"
  on public.student_tags for insert to authenticated
  with check (public.is_admin());

drop policy if exists "student_tags_update_admin" on public.student_tags;
create policy "student_tags_update_admin"
  on public.student_tags for update to authenticated
  using (public.is_admin());

drop policy if exists "student_tags_delete_admin" on public.student_tags;
create policy "student_tags_delete_admin"
  on public.student_tags for delete to authenticated
  using (public.is_admin());

-- 生徒タグ付与: 本人は閲覧、管理者のみ変更
drop policy if exists "profile_student_tags_select" on public.profile_student_tags;
create policy "profile_student_tags_select"
  on public.profile_student_tags for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "profile_student_tags_insert_admin" on public.profile_student_tags;
create policy "profile_student_tags_insert_admin"
  on public.profile_student_tags for insert to authenticated
  with check (public.is_admin());

drop policy if exists "profile_student_tags_delete_admin" on public.profile_student_tags;
create policy "profile_student_tags_delete_admin"
  on public.profile_student_tags for delete to authenticated
  using (public.is_admin());

-- お知らせ配信先: 管理者のみ CRUD、閲覧は認証済み
drop policy if exists "announcement_target_tags_select" on public.announcement_target_tags;
create policy "announcement_target_tags_select"
  on public.announcement_target_tags for select to authenticated using (true);

drop policy if exists "announcement_target_tags_admin" on public.announcement_target_tags;
create policy "announcement_target_tags_admin"
  on public.announcement_target_tags for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "announcement_target_students_select" on public.announcement_target_students;
create policy "announcement_target_students_select"
  on public.announcement_target_students for select to authenticated using (true);

drop policy if exists "announcement_target_students_admin" on public.announcement_target_students;
create policy "announcement_target_students_admin"
  on public.announcement_target_students for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- お知らせ: 生徒は配信対象のみ閲覧
drop policy if exists "announcements_select_all" on public.announcements;
create policy "announcements_select_student"
  on public.announcements for select to authenticated
  using (
    public.is_admin()
    or target_all
    or exists (
      select 1 from public.announcement_target_students ats
      where ats.announcement_id = id and ats.student_id = auth.uid()
    )
    or exists (
      select 1 from public.announcement_target_tags att
      inner join public.profile_student_tags pst on pst.tag_id = att.tag_id
      where att.announcement_id = id and pst.profile_id = auth.uid()
    )
  );

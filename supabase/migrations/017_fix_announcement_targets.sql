-- お知らせ配信先機能の修復（012 未適用環境向け・再実行可）
-- Supabase Dashboard > SQL Editor で実行してください

alter table public.announcements
  add column if not exists target_all boolean not null default false;

create table if not exists public.student_tags (
  id uuid primary key default gen_random_uuid(),
  category text not null default '',
  name text not null,
  created_at timestamptz not null default now(),
  unique (category, name)
);

create table if not exists public.profile_student_tags (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tag_id uuid not null references public.student_tags (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (profile_id, tag_id)
);

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

-- 配信先未設定の既存お知らせは全員配信扱いにする
update public.announcements a
set target_all = true
where a.target_all = false
  and not exists (
    select 1 from public.announcement_target_tags t where t.announcement_id = a.id
  )
  and not exists (
    select 1 from public.announcement_target_students s where s.announcement_id = a.id
  );

alter table public.student_tags enable row level security;
alter table public.profile_student_tags enable row level security;
alter table public.announcement_target_tags enable row level security;
alter table public.announcement_target_students enable row level security;

drop policy if exists "student_tags_select_all" on public.student_tags;
create policy "student_tags_select_all"
  on public.student_tags for select to authenticated using (true);

drop policy if exists "profile_student_tags_select" on public.profile_student_tags;
create policy "profile_student_tags_select"
  on public.profile_student_tags for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "announcement_target_tags_select" on public.announcement_target_tags;
create policy "announcement_target_tags_select"
  on public.announcement_target_tags for select to authenticated using (true);

drop policy if exists "announcement_target_students_select" on public.announcement_target_students;
create policy "announcement_target_students_select"
  on public.announcement_target_students for select to authenticated using (true);

drop policy if exists "announcements_select_all" on public.announcements;
drop policy if exists "announcements_select_student" on public.announcements;
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

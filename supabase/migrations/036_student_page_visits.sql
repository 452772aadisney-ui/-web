-- メニュー探索実績用: 生徒が開いたページの記録
-- Supabase Dashboard > SQL Editor で実行してください

create table if not exists public.student_page_visits (
  student_id uuid not null references public.profiles (id) on delete cascade,
  page_key text not null,
  first_visited_at timestamptz not null default now(),
  primary key (student_id, page_key)
);

comment on table public.student_page_visits is '生徒が初めて開いたダッシュボードページ';

create index if not exists student_page_visits_student_id_idx
  on public.student_page_visits (student_id);

alter table public.student_page_visits enable row level security;

drop policy if exists "student_page_visits_select_own" on public.student_page_visits;
create policy "student_page_visits_select_own"
  on public.student_page_visits for select
  to authenticated
  using (student_id = auth.uid());

drop policy if exists "student_page_visits_select_admin" on public.student_page_visits;
create policy "student_page_visits_select_admin"
  on public.student_page_visits for select
  to authenticated
  using (public.is_admin());

drop policy if exists "student_page_visits_insert_own" on public.student_page_visits;
create policy "student_page_visits_insert_own"
  on public.student_page_visits for insert
  to authenticated
  with check (student_id = auth.uid());

drop policy if exists "student_page_visits_update_own" on public.student_page_visits;
create policy "student_page_visits_update_own"
  on public.student_page_visits for update
  to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

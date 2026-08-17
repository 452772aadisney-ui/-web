-- 小テストマスタ・実施・点数
-- Supabase Dashboard > SQL Editor で実行してください

create table if not exists public.quiz_masters (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null default '',
  max_score integer not null check (max_score > 0),
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.quiz_masters is '小テストマスタ（名称・満点など）';

create table if not exists public.quiz_assignments (
  id uuid primary key default gen_random_uuid(),
  quiz_master_id uuid not null references public.quiz_masters (id) on delete cascade,
  scheduled_on date not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.quiz_assignments is '小テストの実施（日付・対象生徒）';

create index if not exists quiz_assignments_master_idx
  on public.quiz_assignments (quiz_master_id, scheduled_on desc);

create table if not exists public.quiz_assignment_students (
  quiz_assignment_id uuid not null references public.quiz_assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  primary key (quiz_assignment_id, student_id)
);

comment on table public.quiz_assignment_students is '小テスト実施の対象生徒';

create index if not exists quiz_assignment_students_student_idx
  on public.quiz_assignment_students (student_id);

create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  quiz_assignment_id uuid not null references public.quiz_assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  score numeric(8, 2) not null check (score >= 0),
  max_score integer not null check (max_score > 0),
  note text not null default '',
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (quiz_assignment_id, student_id)
);

comment on table public.quiz_results is '小テストの点数';

create index if not exists quiz_results_student_idx
  on public.quiz_results (student_id, recorded_at desc);

drop trigger if exists quiz_masters_updated_at on public.quiz_masters;
create trigger quiz_masters_updated_at
  before update on public.quiz_masters
  for each row execute function public.handle_updated_at();

drop trigger if exists quiz_assignments_updated_at on public.quiz_assignments;
create trigger quiz_assignments_updated_at
  before update on public.quiz_assignments
  for each row execute function public.handle_updated_at();

alter table public.quiz_masters enable row level security;
alter table public.quiz_assignments enable row level security;
alter table public.quiz_assignment_students enable row level security;
alter table public.quiz_results enable row level security;

drop policy if exists "quiz_masters_select_authenticated" on public.quiz_masters;
create policy "quiz_masters_select_authenticated"
  on public.quiz_masters for select to authenticated using (true);

drop policy if exists "quiz_masters_insert_admin" on public.quiz_masters;
create policy "quiz_masters_insert_admin"
  on public.quiz_masters for insert to authenticated
  with check (public.is_admin());

drop policy if exists "quiz_masters_update_admin" on public.quiz_masters;
create policy "quiz_masters_update_admin"
  on public.quiz_masters for update to authenticated
  using (public.is_admin());

drop policy if exists "quiz_masters_delete_admin" on public.quiz_masters;
create policy "quiz_masters_delete_admin"
  on public.quiz_masters for delete to authenticated
  using (public.is_admin());

drop policy if exists "quiz_assignments_select_authenticated" on public.quiz_assignments;
create policy "quiz_assignments_select_authenticated"
  on public.quiz_assignments for select to authenticated using (true);

drop policy if exists "quiz_assignments_insert_admin" on public.quiz_assignments;
create policy "quiz_assignments_insert_admin"
  on public.quiz_assignments for insert to authenticated
  with check (public.is_admin());

drop policy if exists "quiz_assignments_update_admin" on public.quiz_assignments;
create policy "quiz_assignments_update_admin"
  on public.quiz_assignments for update to authenticated
  using (public.is_admin());

drop policy if exists "quiz_assignments_delete_admin" on public.quiz_assignments;
create policy "quiz_assignments_delete_admin"
  on public.quiz_assignments for delete to authenticated
  using (public.is_admin());

drop policy if exists "quiz_assignment_students_select_authenticated" on public.quiz_assignment_students;
create policy "quiz_assignment_students_select_authenticated"
  on public.quiz_assignment_students for select to authenticated using (true);

drop policy if exists "quiz_assignment_students_insert_admin" on public.quiz_assignment_students;
create policy "quiz_assignment_students_insert_admin"
  on public.quiz_assignment_students for insert to authenticated
  with check (public.is_admin());

drop policy if exists "quiz_assignment_students_delete_admin" on public.quiz_assignment_students;
create policy "quiz_assignment_students_delete_admin"
  on public.quiz_assignment_students for delete to authenticated
  using (public.is_admin());

drop policy if exists "quiz_results_select_own_or_admin" on public.quiz_results;
create policy "quiz_results_select_own_or_admin"
  on public.quiz_results for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

drop policy if exists "quiz_results_insert_admin" on public.quiz_results;
create policy "quiz_results_insert_admin"
  on public.quiz_results for insert to authenticated
  with check (public.is_admin());

drop policy if exists "quiz_results_update_admin" on public.quiz_results;
create policy "quiz_results_update_admin"
  on public.quiz_results for update to authenticated
  using (public.is_admin());

drop policy if exists "quiz_results_delete_admin" on public.quiz_results;
create policy "quiz_results_delete_admin"
  on public.quiz_results for delete to authenticated
  using (public.is_admin());

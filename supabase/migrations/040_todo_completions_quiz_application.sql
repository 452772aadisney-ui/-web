-- 小テスト・申込関連 ToDo の完了記録
-- Supabase Dashboard > SQL Editor で実行してください

create table if not exists public.quiz_schedule_completions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  exam_schedule_id uuid not null references public.exam_schedules (id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (student_id, exam_schedule_id)
);

comment on table public.quiz_schedule_completions is '生徒ごとの小テスト ToDo 完了記録';

create index if not exists quiz_schedule_completions_student_idx
  on public.quiz_schedule_completions (student_id);

create index if not exists quiz_schedule_completions_schedule_idx
  on public.quiz_schedule_completions (exam_schedule_id);

create table if not exists public.application_task_completions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  application_task_id uuid not null references public.application_tasks (id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (student_id, application_task_id)
);

comment on table public.application_task_completions is '生徒ごとの申込関連 ToDo 完了記録';

create index if not exists application_task_completions_student_idx
  on public.application_task_completions (student_id);

create index if not exists application_task_completions_task_idx
  on public.application_task_completions (application_task_id);

alter table public.quiz_schedule_completions enable row level security;
alter table public.application_task_completions enable row level security;

drop policy if exists "quiz_schedule_completions_select_own" on public.quiz_schedule_completions;
create policy "quiz_schedule_completions_select_own"
  on public.quiz_schedule_completions for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

drop policy if exists "quiz_schedule_completions_insert_own" on public.quiz_schedule_completions;
create policy "quiz_schedule_completions_insert_own"
  on public.quiz_schedule_completions for insert to authenticated
  with check (student_id = auth.uid());

drop policy if exists "quiz_schedule_completions_delete_own" on public.quiz_schedule_completions;
create policy "quiz_schedule_completions_delete_own"
  on public.quiz_schedule_completions for delete to authenticated
  using (student_id = auth.uid());

drop policy if exists "application_task_completions_select_own" on public.application_task_completions;
create policy "application_task_completions_select_own"
  on public.application_task_completions for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

drop policy if exists "application_task_completions_insert_own" on public.application_task_completions;
create policy "application_task_completions_insert_own"
  on public.application_task_completions for insert to authenticated
  with check (student_id = auth.uid());

drop policy if exists "application_task_completions_delete_own" on public.application_task_completions;
create policy "application_task_completions_delete_own"
  on public.application_task_completions for delete to authenticated
  using (student_id = auth.uid());

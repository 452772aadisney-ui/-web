-- ToDo: 宿題完了ステータス / 申込関連タスク
-- Supabase Dashboard > SQL Editor で実行してください

create table if not exists public.homework_completions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  homework_task_id uuid not null references public.homework_tasks (id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (student_id, homework_task_id)
);

comment on table public.homework_completions is '生徒ごとの宿題完了記録';

create index if not exists homework_completions_student_idx
  on public.homework_completions (student_id);

create index if not exists homework_completions_task_idx
  on public.homework_completions (homework_task_id);

create table if not exists public.application_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_date date not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.application_tasks is '申込関連タスク（全生徒共通）';

create index if not exists application_tasks_due_date_idx
  on public.application_tasks (due_date);

drop trigger if exists application_tasks_updated_at on public.application_tasks;
create trigger application_tasks_updated_at
  before update on public.application_tasks
  for each row execute function public.handle_updated_at();

alter table public.homework_completions enable row level security;
alter table public.application_tasks enable row level security;

-- 宿題完了: 本人は自分の行を参照・登録・削除、管理者は全件参照
drop policy if exists "homework_completions_select_own" on public.homework_completions;
create policy "homework_completions_select_own"
  on public.homework_completions for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

drop policy if exists "homework_completions_insert_own" on public.homework_completions;
create policy "homework_completions_insert_own"
  on public.homework_completions for insert to authenticated
  with check (student_id = auth.uid());

drop policy if exists "homework_completions_delete_own" on public.homework_completions;
create policy "homework_completions_delete_own"
  on public.homework_completions for delete to authenticated
  using (student_id = auth.uid());

-- 申込タスク: 認証済みは閲覧、管理者のみ CRUD
drop policy if exists "application_tasks_select_all" on public.application_tasks;
create policy "application_tasks_select_all"
  on public.application_tasks for select to authenticated using (true);

drop policy if exists "application_tasks_insert_admin" on public.application_tasks;
create policy "application_tasks_insert_admin"
  on public.application_tasks for insert to authenticated
  with check (public.is_admin());

drop policy if exists "application_tasks_update_admin" on public.application_tasks;
create policy "application_tasks_update_admin"
  on public.application_tasks for update to authenticated
  using (public.is_admin());

drop policy if exists "application_tasks_delete_admin" on public.application_tasks;
create policy "application_tasks_delete_admin"
  on public.application_tasks for delete to authenticated
  using (public.is_admin());

-- 模試・小テスト / 宿題・タスク スケジュール
-- Supabase Dashboard > SQL Editor で実行してください

create type public.exam_schedule_type as enum ('mock_exam', 'quiz');

create table if not exists public.exam_schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  exam_type public.exam_schedule_type not null,
  subject text not null default '',
  scheduled_on date not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.homework_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  due_date date not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.exam_schedules is '模試・小テストのスケジュール（全生徒共通）';
comment on table public.homework_tasks is '宿題・タスク（教科別、期日付き）';

create index if not exists exam_schedules_scheduled_on_idx on public.exam_schedules (scheduled_on);
create index if not exists homework_tasks_due_date_idx on public.homework_tasks (due_date);

drop trigger if exists exam_schedules_updated_at on public.exam_schedules;
create trigger exam_schedules_updated_at
  before update on public.exam_schedules
  for each row execute function public.handle_updated_at();

drop trigger if exists homework_tasks_updated_at on public.homework_tasks;
create trigger homework_tasks_updated_at
  before update on public.homework_tasks
  for each row execute function public.handle_updated_at();

alter table public.exam_schedules enable row level security;
alter table public.homework_tasks enable row level security;

-- 認証済みユーザーは閲覧可能
drop policy if exists "exam_schedules_select_all" on public.exam_schedules;
create policy "exam_schedules_select_all"
  on public.exam_schedules for select to authenticated using (true);

drop policy if exists "homework_tasks_select_all" on public.homework_tasks;
create policy "homework_tasks_select_all"
  on public.homework_tasks for select to authenticated using (true);

-- 管理者のみ作成・更新・削除
drop policy if exists "exam_schedules_insert_admin" on public.exam_schedules;
create policy "exam_schedules_insert_admin"
  on public.exam_schedules for insert to authenticated
  with check (public.is_admin());

drop policy if exists "exam_schedules_update_admin" on public.exam_schedules;
create policy "exam_schedules_update_admin"
  on public.exam_schedules for update to authenticated
  using (public.is_admin());

drop policy if exists "exam_schedules_delete_admin" on public.exam_schedules;
create policy "exam_schedules_delete_admin"
  on public.exam_schedules for delete to authenticated
  using (public.is_admin());

drop policy if exists "homework_tasks_insert_admin" on public.homework_tasks;
create policy "homework_tasks_insert_admin"
  on public.homework_tasks for insert to authenticated
  with check (public.is_admin());

drop policy if exists "homework_tasks_update_admin" on public.homework_tasks;
create policy "homework_tasks_update_admin"
  on public.homework_tasks for update to authenticated
  using (public.is_admin());

drop policy if exists "homework_tasks_delete_admin" on public.homework_tasks;
create policy "homework_tasks_delete_admin"
  on public.homework_tasks for delete to authenticated
  using (public.is_admin());

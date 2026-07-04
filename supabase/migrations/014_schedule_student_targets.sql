-- スケジュール・タスクの生徒別配信先
-- Supabase Dashboard > SQL Editor で実行してください

alter table public.exam_schedules
  add column if not exists target_all boolean not null default false;

alter table public.homework_tasks
  add column if not exists target_all boolean not null default false;

alter table public.application_tasks
  add column if not exists target_all boolean not null default false;

-- 既存データは全員向けとして扱う
update public.exam_schedules set target_all = true where target_all = false;
update public.homework_tasks set target_all = true where target_all = false;
update public.application_tasks set target_all = true where target_all = false;

create table if not exists public.exam_schedule_students (
  exam_schedule_id uuid not null references public.exam_schedules (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  primary key (exam_schedule_id, student_id)
);

create table if not exists public.homework_task_students (
  homework_task_id uuid not null references public.homework_tasks (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  primary key (homework_task_id, student_id)
);

create table if not exists public.application_task_students (
  application_task_id uuid not null references public.application_tasks (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  primary key (application_task_id, student_id)
);

create index if not exists exam_schedule_students_student_idx
  on public.exam_schedule_students (student_id);

create index if not exists homework_task_students_student_idx
  on public.homework_task_students (student_id);

create index if not exists application_task_students_student_idx
  on public.application_task_students (student_id);

alter table public.exam_schedule_students enable row level security;
alter table public.homework_task_students enable row level security;
alter table public.application_task_students enable row level security;

drop policy if exists "exam_schedule_students_select_all" on public.exam_schedule_students;
create policy "exam_schedule_students_select_all"
  on public.exam_schedule_students for select to authenticated using (true);

drop policy if exists "exam_schedule_students_insert_admin" on public.exam_schedule_students;
create policy "exam_schedule_students_insert_admin"
  on public.exam_schedule_students for insert to authenticated
  with check (public.is_admin());

drop policy if exists "exam_schedule_students_delete_admin" on public.exam_schedule_students;
create policy "exam_schedule_students_delete_admin"
  on public.exam_schedule_students for delete to authenticated
  using (public.is_admin());

drop policy if exists "homework_task_students_select_all" on public.homework_task_students;
create policy "homework_task_students_select_all"
  on public.homework_task_students for select to authenticated using (true);

drop policy if exists "homework_task_students_insert_admin" on public.homework_task_students;
create policy "homework_task_students_insert_admin"
  on public.homework_task_students for insert to authenticated
  with check (public.is_admin());

drop policy if exists "homework_task_students_delete_admin" on public.homework_task_students;
create policy "homework_task_students_delete_admin"
  on public.homework_task_students for delete to authenticated
  using (public.is_admin());

drop policy if exists "application_task_students_select_all" on public.application_task_students;
create policy "application_task_students_select_all"
  on public.application_task_students for select to authenticated using (true);

drop policy if exists "application_task_students_insert_admin" on public.application_task_students;
create policy "application_task_students_insert_admin"
  on public.application_task_students for insert to authenticated
  with check (public.is_admin());

drop policy if exists "application_task_students_delete_admin" on public.application_task_students;
create policy "application_task_students_delete_admin"
  on public.application_task_students for delete to authenticated
  using (public.is_admin());

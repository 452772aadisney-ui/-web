-- 日別学習フィードバック（スタンプ・コメント）
-- Supabase Dashboard > SQL Editor で実行してください

create table if not exists public.study_day_feedback (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  studied_on date not null,
  stamp text not null check (stamp in ('excellent', 'good', 'effort', 'nice')),
  comment text not null default '',
  admin_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, studied_on)
);

comment on table public.study_day_feedback is '管理者による日別学習フィードバック';

create index if not exists study_day_feedback_student_idx
  on public.study_day_feedback (student_id);

create index if not exists study_day_feedback_studied_on_idx
  on public.study_day_feedback (studied_on);

create table if not exists public.study_day_feedback_reads (
  feedback_id uuid not null references public.study_day_feedback (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (feedback_id, student_id)
);

comment on table public.study_day_feedback_reads is '生徒の学習フィードバック既読';

drop trigger if exists study_day_feedback_updated_at on public.study_day_feedback;
create trigger study_day_feedback_updated_at
  before update on public.study_day_feedback
  for each row
  execute function public.handle_updated_at();

alter table public.study_day_feedback enable row level security;
alter table public.study_day_feedback_reads enable row level security;

drop policy if exists "study_day_feedback_select" on public.study_day_feedback;
create policy "study_day_feedback_select"
  on public.study_day_feedback for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

drop policy if exists "study_day_feedback_insert_admin" on public.study_day_feedback;
create policy "study_day_feedback_insert_admin"
  on public.study_day_feedback for insert to authenticated
  with check (public.is_admin());

drop policy if exists "study_day_feedback_update_admin" on public.study_day_feedback;
create policy "study_day_feedback_update_admin"
  on public.study_day_feedback for update to authenticated
  using (public.is_admin());

drop policy if exists "study_day_feedback_delete_admin" on public.study_day_feedback;
create policy "study_day_feedback_delete_admin"
  on public.study_day_feedback for delete to authenticated
  using (public.is_admin());

drop policy if exists "study_day_feedback_reads_select" on public.study_day_feedback_reads;
create policy "study_day_feedback_reads_select"
  on public.study_day_feedback_reads for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

drop policy if exists "study_day_feedback_reads_insert" on public.study_day_feedback_reads;
create policy "study_day_feedback_reads_insert"
  on public.study_day_feedback_reads for insert to authenticated
  with check (student_id = auth.uid());

drop policy if exists "study_day_feedback_reads_delete_admin" on public.study_day_feedback_reads;
create policy "study_day_feedback_reads_delete_admin"
  on public.study_day_feedback_reads for delete to authenticated
  using (public.is_admin());

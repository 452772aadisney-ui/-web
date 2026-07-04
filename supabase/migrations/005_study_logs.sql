-- 学習記録テーブル
-- Supabase Dashboard > SQL Editor で実行してください

create table if not exists public.study_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  textbook_name text not null,
  content text not null default '',
  duration_minutes integer not null check (duration_minutes > 0),
  studied_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.study_logs is '生徒の日次学習記録';

create index if not exists study_logs_student_id_idx on public.study_logs (student_id);
create index if not exists study_logs_studied_on_idx on public.study_logs (studied_on);
create index if not exists study_logs_student_studied_on_idx on public.study_logs (student_id, studied_on);

drop trigger if exists study_logs_updated_at on public.study_logs;
create trigger study_logs_updated_at
  before update on public.study_logs
  for each row
  execute function public.handle_updated_at();

alter table public.study_logs enable row level security;

-- 生徒: 自分の記録のみ参照
drop policy if exists "study_logs_select_own" on public.study_logs;
create policy "study_logs_select_own"
  on public.study_logs for select
  to authenticated
  using (student_id = auth.uid());

-- 管理者: 全記録参照
drop policy if exists "study_logs_select_admin" on public.study_logs;
create policy "study_logs_select_admin"
  on public.study_logs for select
  to authenticated
  using (public.is_admin());

-- 生徒: 自分の記録のみ作成
drop policy if exists "study_logs_insert_own" on public.study_logs;
create policy "study_logs_insert_own"
  on public.study_logs for insert
  to authenticated
  with check (student_id = auth.uid());

-- 生徒: 自分の記録のみ更新
drop policy if exists "study_logs_update_own" on public.study_logs;
create policy "study_logs_update_own"
  on public.study_logs for update
  to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- 生徒: 自分の記録のみ削除
drop policy if exists "study_logs_delete_own" on public.study_logs;
create policy "study_logs_delete_own"
  on public.study_logs for delete
  to authenticated
  using (student_id = auth.uid());

-- 生徒の教材（テキスト）登録
-- Supabase Dashboard > SQL Editor で実行してください

create table if not exists public.textbooks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  subjects text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint textbooks_name_not_empty check (char_length(trim(name)) > 0)
);

comment on table public.textbooks is '生徒ごとの教材（テキスト）マスタ';
comment on column public.textbooks.subjects is 'この教材に紐づく科目タグ';

create index if not exists textbooks_student_id_idx on public.textbooks (student_id);

drop trigger if exists textbooks_updated_at on public.textbooks;
create trigger textbooks_updated_at
  before update on public.textbooks
  for each row
  execute function public.handle_updated_at();

alter table public.textbooks enable row level security;

-- 生徒: 自分の教材を参照
drop policy if exists "textbooks_select_own" on public.textbooks;
create policy "textbooks_select_own"
  on public.textbooks for select
  to authenticated
  using (student_id = auth.uid());

-- 管理者: 全教材を参照
drop policy if exists "textbooks_select_admin" on public.textbooks;
create policy "textbooks_select_admin"
  on public.textbooks for select
  to authenticated
  using (public.is_admin());

-- 生徒: 自分の教材を作成
drop policy if exists "textbooks_insert_own" on public.textbooks;
create policy "textbooks_insert_own"
  on public.textbooks for insert
  to authenticated
  with check (student_id = auth.uid());

-- 管理者: 任意の生徒の教材を作成
drop policy if exists "textbooks_insert_admin" on public.textbooks;
create policy "textbooks_insert_admin"
  on public.textbooks for insert
  to authenticated
  with check (public.is_admin());

-- 生徒: 自分の教材を更新
drop policy if exists "textbooks_update_own" on public.textbooks;
create policy "textbooks_update_own"
  on public.textbooks for update
  to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- 管理者: 任意の生徒の教材を更新
drop policy if exists "textbooks_update_admin" on public.textbooks;
create policy "textbooks_update_admin"
  on public.textbooks for update
  to authenticated
  using (public.is_admin());

-- 生徒: 自分の教材を削除
drop policy if exists "textbooks_delete_own" on public.textbooks;
create policy "textbooks_delete_own"
  on public.textbooks for delete
  to authenticated
  using (student_id = auth.uid());

-- 管理者: 任意の生徒の教材を削除
drop policy if exists "textbooks_delete_admin" on public.textbooks;
create policy "textbooks_delete_admin"
  on public.textbooks for delete
  to authenticated
  using (public.is_admin());

-- 学習記録に教材 ID を紐づけ（任意・履歴保持のため textbook_name も残す）
alter table public.study_logs
  add column if not exists textbook_id uuid references public.textbooks (id) on delete set null;

create index if not exists study_logs_textbook_id_idx on public.study_logs (textbook_id);

-- 1対1チャット（生徒 ↔ 管理者）
-- Supabase Dashboard > SQL Editor で実行してください
-- Realtime: Database > Replication で chat_messages が有効か確認してください

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

comment on table public.chat_messages is '生徒と管理者の1対1チャットメッセージ';
comment on column public.chat_messages.student_id is '会話スレッド（生徒ID）';

create index if not exists chat_messages_student_created_idx
  on public.chat_messages (student_id, created_at);

alter table public.chat_messages enable row level security;

-- 生徒: 自分のスレッドのみ閲覧
drop policy if exists "chat_messages_select_student" on public.chat_messages;
create policy "chat_messages_select_student"
  on public.chat_messages for select to authenticated
  using (student_id = auth.uid());

-- 管理者: 全スレッド閲覧
drop policy if exists "chat_messages_select_admin" on public.chat_messages;
create policy "chat_messages_select_admin"
  on public.chat_messages for select to authenticated
  using (public.is_admin());

-- 生徒: 自分のスレッドに自分として送信
drop policy if exists "chat_messages_insert_student" on public.chat_messages;
create policy "chat_messages_insert_student"
  on public.chat_messages for insert to authenticated
  with check (
    student_id = auth.uid()
    and sender_id = auth.uid()
  );

-- 管理者: 生徒スレッドに自分として送信
drop policy if exists "chat_messages_insert_admin" on public.chat_messages;
create policy "chat_messages_insert_admin"
  on public.chat_messages for insert to authenticated
  with check (
    public.is_admin()
    and sender_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = student_id and p.role = 'student'
    )
  );

-- Realtime 配信の設定
alter table public.chat_messages replica identity full;

-- 既に追加済みの場合はエラーになることがあります（無視して構いません）
alter publication supabase_realtime add table public.chat_messages;

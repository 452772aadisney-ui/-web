-- チャット既読状態
-- Supabase Dashboard > SQL Editor で実行してください

create table if not exists public.chat_read_states (
  user_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, student_id)
);

comment on table public.chat_read_states is 'チャットスレッドごとの最終既読日時';

create index if not exists chat_read_states_user_idx
  on public.chat_read_states (user_id);

alter table public.chat_read_states enable row level security;

drop policy if exists "chat_read_states_select_own" on public.chat_read_states;
create policy "chat_read_states_select_own"
  on public.chat_read_states for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "chat_read_states_upsert_own" on public.chat_read_states;
create policy "chat_read_states_insert_own"
  on public.chat_read_states for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "chat_read_states_update_own" on public.chat_read_states;
create policy "chat_read_states_update_own"
  on public.chat_read_states for update to authenticated
  using (user_id = auth.uid());

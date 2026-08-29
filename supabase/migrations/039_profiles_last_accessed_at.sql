-- 生徒の最終アクセス日時（管理画面の生徒一覧表示用）
-- Supabase Dashboard > SQL Editor で実行してください

alter table public.profiles
  add column if not exists last_accessed_at timestamptz;

comment on column public.profiles.last_accessed_at is '生徒画面への最終アクセス日時（JST表示）';

create index if not exists profiles_last_accessed_at_idx
  on public.profiles (last_accessed_at desc nulls last);

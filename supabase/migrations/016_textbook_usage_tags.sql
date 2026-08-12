-- 教材の用途タグ（授業用・自習用）
-- Supabase Dashboard > SQL Editor で実行してください

alter table public.textbooks
  add column if not exists usage_tags text[] not null default '{}';

comment on column public.textbooks.usage_tags is '教材の用途タグ（授業用・自習用など）';

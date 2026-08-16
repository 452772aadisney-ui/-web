-- 新規生徒向けFAQ案内の既読管理
-- Supabase Dashboard > SQL Editor で実行してください

alter table public.profiles
  add column if not exists faq_intro_seen_at timestamptz;

comment on column public.profiles.faq_intro_seen_at is 'FAQ初回案内を確認した日時（null = 未確認）';

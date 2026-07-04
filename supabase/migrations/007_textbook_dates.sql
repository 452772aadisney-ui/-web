-- 教材に開始日・終了予定日を追加
-- Supabase Dashboard > SQL Editor で実行してください

alter table public.textbooks
  add column if not exists start_date date,
  add column if not exists planned_end_date date;

comment on column public.textbooks.start_date is '教材の学習開始日';
comment on column public.textbooks.planned_end_date is '教材の学習終了予定日';

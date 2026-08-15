-- 既卒タグ追加
-- Supabase Dashboard > SQL Editor で実行してください

insert into public.student_tags (category, name) values
  ('学年', '既卒')
on conflict (category, name) do nothing;

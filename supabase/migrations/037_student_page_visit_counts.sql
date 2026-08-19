-- ページ訪問回数（学習履歴の閲覧回数など）
-- Supabase Dashboard > SQL Editor で実行してください

alter table public.student_page_visits
  add column if not exists visit_count integer not null default 1;

comment on column public.student_page_visits.visit_count is 'ページを開いた累計回数';

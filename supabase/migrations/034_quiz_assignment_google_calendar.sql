-- 小テスト実施の Google カレンダー連携（生徒ごと）
-- Supabase Dashboard > SQL Editor で実行してください

alter table public.quiz_assignment_students
  add column if not exists google_calendar_event_id text;

comment on column public.quiz_assignment_students.google_calendar_event_id is
  'Google Calendar のイベント ID（生徒ごとの小テスト予定）';

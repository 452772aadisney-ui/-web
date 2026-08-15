-- 小テスト等の Google カレンダー連携用
-- Supabase Dashboard > SQL Editor で実行してください

alter table public.exam_schedules
  add column if not exists google_calendar_event_id text;

comment on column public.exam_schedules.google_calendar_event_id is
  'Google Calendar のイベント ID（小テスト登録時に設定）';

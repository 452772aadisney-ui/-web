-- コーチング予約と Google カレンダー予定の紐付け
-- Supabase Dashboard > SQL Editor で実行してください

alter table public.coaching_bookings
  add column if not exists google_calendar_event_id text;

comment on column public.coaching_bookings.google_calendar_event_id is
  'Google カレンダーに作成した予定 ID。キャンセル時に削除するために保持する';

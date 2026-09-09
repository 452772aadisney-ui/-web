-- コーチング予約の schedule_revision / Google Calendar ETag
-- Supabase Dashboard > SQL Editor で実行してください
--
-- schedule_revision: 予約枠変更ごとの一意な操作ID（UUID）。
--   booked_at は「直近の予約操作時刻」表示・並び用のまま維持する。
-- google_calendar_etag: GWS 条件付き更新（If-Match）用。

alter table public.coaching_bookings
  add column if not exists schedule_revision uuid not null default gen_random_uuid();

alter table public.coaching_bookings
  add column if not exists google_calendar_etag text;

comment on column public.coaching_bookings.schedule_revision is
  '予約変更ごとの永続 revision（通知冪等・楽観ロック・GWS同期）。UUID。';
comment on column public.coaching_bookings.google_calendar_etag is
  'Google Calendar event etag（If-Match 条件付き patch 用）';
comment on column public.coaching_bookings.booked_at is
  '直近の予約操作時刻（一覧並び等）。schedule_revision の代替には使わない。';

-- 既存行に default が入るが、明示的に揃えておく（idempotent）
update public.coaching_bookings
set schedule_revision = coalesce(schedule_revision, gen_random_uuid())
where schedule_revision is null;

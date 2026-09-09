-- 060 rollback（schedule_revision / google_calendar_etag のみ削除）
-- POLICY: 本番では原則実行しない。アプリがこれらの列を読み書きしている間は落とさない。

alter table public.coaching_bookings
  drop column if exists google_calendar_etag;

alter table public.coaching_bookings
  drop column if exists schedule_revision;

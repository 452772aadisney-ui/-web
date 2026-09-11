-- 060 rollback（破壊的: schedule_revision / google_calendar_etag を DROP）
-- POLICY: 本番では原則実行しない。既定の復旧はアプリ戻し + 列残置。
-- 列 DROP はデータ損失（etag / revision）を伴う。アプリが読み書き中は落とさない。
-- 切替手順: supabase/rollbacks/060_061_coaching_reschedule_notify_rollout.md

alter table public.coaching_bookings
  drop column if exists google_calendar_etag;

alter table public.coaching_bookings
  drop column if exists schedule_revision;

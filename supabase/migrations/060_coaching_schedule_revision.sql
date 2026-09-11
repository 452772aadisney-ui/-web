-- コーチング予約の schedule_revision / Google Calendar ETag
-- Supabase Dashboard > SQL Editor で実行してください
--
-- precheck: supabase/rollbacks/060_coaching_schedule_revision_precheck.sql
-- verify:   supabase/rollbacks/060_coaching_schedule_revision_verify.sql
-- rollback: supabase/rollbacks/060_coaching_schedule_revision_rollback.sql
-- rollout:  supabase/rollbacks/060_061_coaching_reschedule_notify_rollout.md
--
-- schedule_revision: 予約枠変更ごとの一意な操作ID（UUID）。
--   booked_at は「直近の予約操作時刻」表示・並び用のまま維持する。
-- google_calendar_etag: GWS 条件付き更新（If-Match）用。
--
-- 互換性（旧アプリ稼働中のスキーマ先行適用）:
-- - ADD COLUMN … DEFAULT により既存行にも UUID が付与される（NOT NULL）。
-- - 新規 INSERT も default で revision が入る（アプリが列を知らなくても可）。
-- - 旧コードが schedule_revision を読まなくても SELECT * 以外は壊れない。
-- - ただし旧コードの UPDATE は revision / If-Match を進めないため、
--   新旧併存中の予約変更は競合保証が限定される。
-- - 060→061 適用後〜新アプリ反映・確認完了まで、生徒・管理者とも
--   予約の作成・変更・取消を控える（詳細は rollout md）。旧タブ操作にも注意し、
--   反映後はページ再読込を案内する。「変更停止は不要」とは断定しない。
-- - 本 migration は既存行を削除しない。RLS / GRANT を変更しない。
-- - 復旧の既定はアプリ戻し + 列残置。列 DROP は破壊的（rollback SQL）。

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

-- 既存行に default が入るが、明示的に揃えておく（idempotent / null 0 件保証）
update public.coaching_bookings
set schedule_revision = gen_random_uuid()
where schedule_revision is null;

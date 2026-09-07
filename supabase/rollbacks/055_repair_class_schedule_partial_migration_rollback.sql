-- 055_repair_class_schedule_partial_migration の rollback 方針
--
-- この修復はセキュリティ硬化と最終スキーマへの収束を含むため、
-- 「旧053の危険な権限・旧6引数RPC・uuid既卒関数」へ戻す rollback は行いません。
--
-- 戻さないもの（意図的）:
-- - authenticated/anon への書き込み RPC EXECUTE
-- - is_kisotsu_profile(uuid)
-- - 旧 create_class_schedule_day_with_sessions(6引数)
-- - push_notification_type 'class_schedule' enum ラベル（Postgres で安全削除困難）
-- - class_schedule テーブル／行データ
--
-- 本番障害時の安全な機能停止（推奨・データ保持）:
--   1) CLASS_SCHEDULE_DELIVERY_MODE=legacy（外部送信なし）
--   2) 管理画面導線の一時停止（アプリ側）
--   3) 下記 REVOKE（テーブルは残す）

revoke all on function public.create_class_schedule_day_with_sessions(
  date, text, text, text, text, jsonb, uuid
) from public, anon, authenticated, service_role;

revoke all on function public.bump_class_schedule_notify_revision(
  uuid, uuid
) from public, anon, authenticated, service_role;

-- 再開時は 055 を再実行するか、service_role へだけ GRANT EXECUTE を戻す。
-- grant execute on function public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid) to service_role;
-- grant execute on function public.bump_class_schedule_notify_revision(uuid, uuid) to service_role;

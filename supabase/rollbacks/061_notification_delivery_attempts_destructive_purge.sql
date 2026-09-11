-- 061 DESTRUCTIVE purge（通常 rollback ではない）
-- 試行履歴・表を完全に消す。本番では明示的な承認がある場合のみ。
--
-- WARNING:
-- - DROP TABLE により notification_delivery_attempts の全履歴が消える
-- - enum 'unknown' は依存のため通常残る（drop しない）
-- - 事前にバックアップを取得すること
--
-- 通常の復旧では本ファイルを使わず、アプリだけ戻して表・履歴を残す:
--   supabase/rollbacks/061_notification_delivery_attempts_rollback.sql

-- Uncomment only after explicit ops approval:
-- drop table if exists public.notification_delivery_attempts;

select
  '061_destructive_purge_is_commented_out'::text as note,
  'Uncomment DROP only with explicit approval; this erases attempt history.'::text as guidance;

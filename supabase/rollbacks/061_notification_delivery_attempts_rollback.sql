-- 061 通常 rollback（履歴保持）
-- 本番では原則「アプリだけ戻す」。本ファイルは破壊的 DROP を行わない。
--
-- 方針:
-- - notification_delivery_attempts 表は残す（試行履歴を保持）
-- - enum 値 'unknown' も残す（PostgreSQL では依存があると drop 困難）
-- - 追加列・表を残したまま旧アプリへ戻すのが既定の復旧
--
-- 互換注意（enum が残るだけでは不十分）:
-- - 旧コードの classifyExistingDeliveries は status='unknown' を
--   sent/failed/pending のいずれでもないため gate=proceed にする。
-- - 続く email claim は既存行で unique 衝突 → 'already_completed' と誤判定し、
--   未達の可能性がある unknown を再送しない。
-- - 旧アプリへ戻す前に、必要なら deliveries.status='unknown' を
--   'failed'（error_code 保持）へ寄せる運用を検討すること（任意・手動）。
--
-- 履歴削除を伴う完全撤去は通常 rollback ではない:
--   supabase/rollbacks/061_notification_delivery_attempts_destructive_purge.sql

select
  '061_safe_rollback_no_drop'::text as note,
  'Keep notification_delivery_attempts; revert app only. See rollout md.'::text as guidance;

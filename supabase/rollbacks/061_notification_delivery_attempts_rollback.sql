-- 061 rollback（本番では原則実行しない）
-- NOTE: enum 値 'unknown' は依存があると drop できないため残す

drop table if exists public.notification_delivery_attempts;

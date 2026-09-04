-- Rollback for 050_push_notifications.sql
-- 適用済みの場合のみ、Supabase Dashboard > SQL Editor で実行してください。
-- migrations/ 配下には置かない（一括適用時に作成直後に削除されるのを防ぐ）。
-- 配信・購読・設定データはすべて削除されます。既存の profiles / メール通知には影響しません。
--
-- 050 で新設したオブジェクトのみ削除する（既存 enum / テーブルは対象外）:
-- Tables: notification_deliveries, notification_events, notification_preferences, push_subscriptions
-- Enums (3): notification_delivery_status, notification_delivery_channel, push_notification_type
-- 削除順: 依存テーブル → 参照元テーブル → enum

drop table if exists public.notification_deliveries cascade;
drop table if exists public.notification_events cascade;
drop table if exists public.notification_preferences cascade;
drop table if exists public.push_subscriptions cascade;

drop type if exists public.notification_delivery_status;
drop type if exists public.notification_delivery_channel;
drop type if exists public.push_notification_type;

-- 053_class_schedule の rollback
-- 適用の逆順: 先に 054 を rollback してから本スクリプトを実行すること。
-- 授業予定テーブル・RPC・重複チェック・既卒ヘルパーを削除する。
-- notification_events / deliveries は予定テーブルへ FK していないため残る。

drop function if exists public.bump_class_schedule_notify_revision(uuid, uuid);
drop function if exists public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb);

drop trigger if exists class_schedule_sessions_overlap_check on public.class_schedule_sessions;
drop function if exists public.class_schedule_sessions_reject_overlap();

drop table if exists public.class_schedule_sessions cascade;
drop table if exists public.class_schedule_days cascade;

drop function if exists public.is_kisotsu_profile(uuid);

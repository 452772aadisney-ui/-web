-- 053_class_schedule の rollback
-- 授業予定テーブル・重複チェック・既卒ヘルパーを削除する。

drop trigger if exists class_schedule_sessions_overlap_check on public.class_schedule_sessions;
drop function if exists public.class_schedule_sessions_reject_overlap();

drop table if exists public.class_schedule_sessions cascade;
drop table if exists public.class_schedule_days cascade;

drop function if exists public.is_kisotsu_profile(uuid);

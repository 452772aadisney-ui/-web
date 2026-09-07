-- 053_class_schedule の rollback
-- 適用の逆順: 先に 054 を rollback してから本スクリプトを実行すること。
-- 授業予定テーブル・RPC・重複チェック・既卒ヘルパーを削除する。
-- notification_events / deliveries は予定テーブルへ FK していないため残る。
-- CASCADE で関数依存を雑に消さない。ポリシーはテーブル DROP 前に明示 DROP。

drop function if exists public.bump_class_schedule_notify_revision(uuid, uuid);
drop function if exists public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb, uuid);
drop function if exists public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb);

drop trigger if exists class_schedule_sessions_overlap_check on public.class_schedule_sessions;
drop function if exists public.class_schedule_sessions_reject_overlap();

do $$
begin
  if to_regclass('public.class_schedule_days') is not null then
    drop policy if exists "class_schedule_days_select" on public.class_schedule_days;
    drop policy if exists "class_schedule_days_insert_admin" on public.class_schedule_days;
    drop policy if exists "class_schedule_days_update_admin" on public.class_schedule_days;
    drop policy if exists "class_schedule_days_delete_admin" on public.class_schedule_days;
  end if;
  if to_regclass('public.class_schedule_sessions') is not null then
    drop policy if exists "class_schedule_sessions_select" on public.class_schedule_sessions;
    drop policy if exists "class_schedule_sessions_insert_admin" on public.class_schedule_sessions;
    drop policy if exists "class_schedule_sessions_update_admin" on public.class_schedule_sessions;
    drop policy if exists "class_schedule_sessions_delete_admin" on public.class_schedule_sessions;
  end if;
end $$;

drop table if exists public.class_schedule_sessions;
drop table if exists public.class_schedule_days;

drop function if exists public.is_kisotsu_profile();
drop function if exists public.is_kisotsu_profile(uuid);

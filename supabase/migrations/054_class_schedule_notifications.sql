-- 054: 授業予定通知カテゴリ class_schedule
-- Supabase Dashboard > SQL Editor で実行してください
-- 本番適用はこのタスクでは行わない

-- ---------------------------------------------------------------------------
-- 1) push_notification_type に class_schedule を追加
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'push_notification_type'
      and e.enumlabel = 'class_schedule'
  ) then
    alter type public.push_notification_type add value 'class_schedule';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) notification_preferences に class_schedule 列（DEFAULT true → 既存行も ON）
-- ---------------------------------------------------------------------------

alter table public.notification_preferences
  add column if not exists class_schedule boolean not null default true;

comment on column public.notification_preferences.class_schedule is
  '既卒授業予定の登録・変更・中止（管理者制御）。true=Push-first（不可時メールfallback）、false=Push・メール両方停止。';

comment on table public.notification_preferences is
  '生徒ごとの通知カテゴリ有効状態（管理者制御）。true=Push-first（不可時メールfallback）、false=Push・メール両方停止。未取得時は送信側で全項目ON扱い。';

-- ---------------------------------------------------------------------------
-- 3) notification_preference_changes.category CHECK を拡張
-- ---------------------------------------------------------------------------

alter table public.notification_preference_changes
  drop constraint if exists notification_preference_changes_category_check;

alter table public.notification_preference_changes
  add constraint notification_preference_changes_category_check
  check (
    category in (
      'study_reminder',
      'announcement',
      'message',
      'coaching_reminder',
      'class_schedule'
    )
  );

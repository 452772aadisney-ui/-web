-- 054_class_schedule_notifications の rollback
-- 注意:
-- 1) Postgres は enum 値の安全な削除が困難なため、push_notification_type 'class_schedule' は残す。
-- 2) 既存4カテゴリの prefs 列・通知履歴・events/deliveries は削除しない。
-- 3) 監査表に category='class_schedule' の行がある場合、狭い CHECK の再追加は失敗する。
--    その場合は当該監査行を別途退避/削除してから再実行するか、CHECK 拡張を維持する。
-- 4) rollback 順: 054 → 053。

alter table public.notification_preference_changes
  drop constraint if exists notification_preference_changes_category_check;

alter table public.notification_preference_changes
  add constraint notification_preference_changes_category_check
  check (
    category in (
      'study_reminder',
      'announcement',
      'message',
      'coaching_reminder'
    )
  );

alter table public.notification_preferences
  drop column if exists class_schedule;

comment on table public.notification_preferences is
  '生徒ごとの通知カテゴリ有効状態（管理者制御）。true=Push-first（不可時メールfallback）、false=Push・メール両方停止。未取得時は送信側で全項目ON扱い。';

-- push_notification_type 'class_schedule' は削除しない（enum 値の安全な除去不可）

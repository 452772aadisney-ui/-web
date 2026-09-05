-- 本番適用前の読み取り専用確認（個人情報なし・件数のみ）
-- notification_preferences の既存 false 値を勝手に変更しない判断用。

select
  count(*)::int as preference_rows,
  count(*) filter (where study_reminder)::int as study_reminder_true,
  count(*) filter (where not study_reminder)::int as study_reminder_false,
  count(*) filter (where announcement)::int as announcement_true,
  count(*) filter (where not announcement)::int as announcement_false,
  count(*) filter (where message)::int as message_true,
  count(*) filter (where not message)::int as message_false,
  count(*) filter (where coaching_reminder)::int as coaching_reminder_true,
  count(*) filter (where not coaching_reminder)::int as coaching_reminder_false,
  count(*) filter (
    where not study_reminder
       or not announcement
       or not message
       or not coaching_reminder
  )::int as any_false_rows,
  count(*) filter (
    where not study_reminder
      and not announcement
      and not message
      and not coaching_reminder
  )::int as all_false_rows
from public.notification_preferences;

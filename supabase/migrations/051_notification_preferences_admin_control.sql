-- 051: notification_preferences を管理者制御へ（生徒は SELECT のみ）
-- 既存の boolean 値は変更しない（false の自動 true 化なし）
-- 適用前に supabase/queries/051_notification_preferences_false_counts.sql で件数確認を推奨

-- ---------------------------------------------------------------------------
-- 1) notification_preferences: authenticated は SELECT のみ
-- ---------------------------------------------------------------------------

comment on table public.notification_preferences is
  '生徒ごとの通知カテゴリ有効状態（管理者制御）。true=Push-first（不可時メールfallback）、false=Push・メール両方停止。未取得時は送信側で全項目ON扱い。';

comment on column public.notification_preferences.study_reminder is
  '学習記録未入力リマインダー（管理者制御）';
comment on column public.notification_preferences.announcement is
  '新規お知らせ（管理者制御）';
comment on column public.notification_preferences.message is
  '新規メッセージ（管理者制御）';
comment on column public.notification_preferences.coaching_reminder is
  'コーチングのお知らせ（管理者制御）';

revoke all on table public.notification_preferences from anon, authenticated;
grant select on table public.notification_preferences to authenticated;

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
drop policy if exists "notification_preferences_update_own" on public.notification_preferences;

-- SELECT 本人ポリシーは維持（無ければ再作成）
drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
  on public.notification_preferences for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2) 管理者変更監査テーブル
-- ---------------------------------------------------------------------------

create table if not exists public.notification_preference_changes (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  changed_by_admin_id uuid not null references public.profiles (id) on delete restrict,
  category text not null
    check (category in ('study_reminder', 'announcement', 'message', 'coaching_reminder')),
  previous_value boolean not null,
  new_value boolean not null,
  reason text null
    check (reason is null or char_length(reason) <= 120),
  created_at timestamptz not null default now(),
  constraint notification_preference_changes_value_changed
    check (previous_value is distinct from new_value)
);

comment on table public.notification_preference_changes is
  '管理者による notification_preferences 変更履歴。一般クライアントからは参照・変更不可。';

create index if not exists notification_preference_changes_target_created_idx
  on public.notification_preference_changes (target_user_id, created_at desc);

create index if not exists notification_preference_changes_admin_created_idx
  on public.notification_preference_changes (changed_by_admin_id, created_at desc);

alter table public.notification_preference_changes enable row level security;

revoke all on table public.notification_preference_changes from anon, authenticated;
-- service role のみ（明示 GRANT なし）

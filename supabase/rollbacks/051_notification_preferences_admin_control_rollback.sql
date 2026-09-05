-- 051_notification_preferences_admin_control の rollback
-- 生徒向け INSERT/UPDATE GRANT と本人ポリシーを復元する。
-- notification_preferences の行データ・4カテゴリ値は削除・変更しない。
-- 監査テーブルのみ削除する（履歴が不要な場合）。

drop table if exists public.notification_preference_changes cascade;

revoke all on table public.notification_preferences from anon, authenticated;
grant select, insert, update on table public.notification_preferences to authenticated;

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
  on public.notification_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own"
  on public.notification_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
  on public.notification_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.notification_preferences is
  '生徒ごとの通知種別オン/オフ。Push 許可・購読の有無とは別。未取得時は送信しない。';

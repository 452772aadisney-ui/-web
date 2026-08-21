-- 宿題完了の upsert（再チェック）用 UPDATE ポリシー
-- Supabase Dashboard > SQL Editor で実行してください

drop policy if exists "homework_completions_update_own" on public.homework_completions;
create policy "homework_completions_update_own"
  on public.homework_completions for update
  to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

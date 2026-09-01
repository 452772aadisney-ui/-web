-- 管理者が生徒の代理予約を作成できるようにする
drop policy if exists "coaching_bookings_insert_own" on public.coaching_bookings;
create policy "coaching_bookings_insert_own"
  on public.coaching_bookings for insert to authenticated
  with check (student_id = auth.uid() or public.is_admin());

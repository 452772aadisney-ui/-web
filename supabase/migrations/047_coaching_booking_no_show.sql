-- コーチング予約に「未実施」ステータスを追加
alter table public.coaching_bookings
  drop constraint if exists coaching_bookings_status_check;

alter table public.coaching_bookings
  add constraint coaching_bookings_status_check
  check (status in ('scheduled', 'completed', 'cancelled', 'no_show'));

comment on column public.coaching_bookings.status is 'scheduled=予約済, completed=実施済, cancelled=キャンセル, no_show=未実施';

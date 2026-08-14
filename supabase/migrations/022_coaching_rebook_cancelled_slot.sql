-- キャンセル済み予約がある枠への再予約を許可する
-- Supabase Dashboard > SQL Editor で実行してください

alter table public.coaching_bookings
  drop constraint if exists coaching_bookings_slot_id_key;

create unique index if not exists coaching_bookings_slot_id_scheduled_unique
  on public.coaching_bookings (slot_id)
  where status = 'scheduled';

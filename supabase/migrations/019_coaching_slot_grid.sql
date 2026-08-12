-- コーチング予約枠を30分グリッド方式に変更
-- Supabase Dashboard > SQL Editor で実行してください

alter table public.coaching_slots
  add column if not exists slot_date date,
  add column if not exists start_time time,
  add column if not exists is_open boolean not null default true;

update public.coaching_slots
set
  slot_date = (starts_at at time zone 'Asia/Tokyo')::date,
  start_time = (starts_at at time zone 'Asia/Tokyo')::time
where slot_date is null and starts_at is not null;

create unique index if not exists coaching_slots_coach_date_time_idx
  on public.coaching_slots (coach_id, slot_date, start_time);

create index if not exists coaching_slots_open_date_idx
  on public.coaching_slots (coach_id, slot_date, is_open);

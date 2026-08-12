-- コーチング予約（講師・枠・予約）
-- Supabase Dashboard > SQL Editor で実行してください

create table if not exists public.coaching_coaches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coaching_coaches_name_not_empty check (char_length(trim(name)) > 0)
);

comment on table public.coaching_coaches is 'コーチング担当講師';

create table if not exists public.coaching_slots (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaching_coaches (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint coaching_slots_time_valid check (ends_at > starts_at)
);

comment on table public.coaching_slots is 'コーチングの予約可能枠';

create index if not exists coaching_slots_coach_starts_idx
  on public.coaching_slots (coach_id, starts_at);

create table if not exists public.coaching_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.coaching_slots (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid not null references public.coaching_coaches (id) on delete cascade,
  student_note text not null default '',
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  booked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slot_id)
);

comment on table public.coaching_bookings is 'コーチング予約';
comment on column public.coaching_bookings.student_note is '生徒からの伝言（任意）';

create index if not exists coaching_bookings_student_idx
  on public.coaching_bookings (student_id, booked_at desc);

create index if not exists coaching_bookings_coach_idx
  on public.coaching_bookings (coach_id, booked_at desc);

drop trigger if exists coaching_coaches_updated_at on public.coaching_coaches;
create trigger coaching_coaches_updated_at
  before update on public.coaching_coaches
  for each row execute function public.handle_updated_at();

drop trigger if exists coaching_bookings_updated_at on public.coaching_bookings;
create trigger coaching_bookings_updated_at
  before update on public.coaching_bookings
  for each row execute function public.handle_updated_at();

alter table public.coaching_coaches enable row level security;
alter table public.coaching_slots enable row level security;
alter table public.coaching_bookings enable row level security;

-- 講師: 認証済みは閲覧、管理者のみ変更
drop policy if exists "coaching_coaches_select" on public.coaching_coaches;
create policy "coaching_coaches_select"
  on public.coaching_coaches for select to authenticated using (true);

drop policy if exists "coaching_coaches_admin" on public.coaching_coaches;
create policy "coaching_coaches_admin"
  on public.coaching_coaches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 枠: 認証済みは閲覧、管理者のみ変更
drop policy if exists "coaching_slots_select" on public.coaching_slots;
create policy "coaching_slots_select"
  on public.coaching_slots for select to authenticated using (true);

drop policy if exists "coaching_slots_admin" on public.coaching_slots;
create policy "coaching_slots_admin"
  on public.coaching_slots for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 予約: 本人は自分の予約を参照・作成・キャンセル、管理者は全件
drop policy if exists "coaching_bookings_select" on public.coaching_bookings;
create policy "coaching_bookings_select"
  on public.coaching_bookings for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

drop policy if exists "coaching_bookings_insert_own" on public.coaching_bookings;
create policy "coaching_bookings_insert_own"
  on public.coaching_bookings for insert to authenticated
  with check (student_id = auth.uid());

drop policy if exists "coaching_bookings_update" on public.coaching_bookings;
create policy "coaching_bookings_update"
  on public.coaching_bookings for update to authenticated
  using (student_id = auth.uid() or public.is_admin())
  with check (student_id = auth.uid() or public.is_admin());

drop policy if exists "coaching_bookings_delete_admin" on public.coaching_bookings;
create policy "coaching_bookings_delete_admin"
  on public.coaching_bookings for delete to authenticated
  using (public.is_admin());

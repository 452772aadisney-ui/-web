-- 生徒の実績（アチーブメント）
-- Supabase Dashboard > SQL Editor で実行してください

create table if not exists public.student_achievements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  unique (student_id, achievement_id)
);

comment on table public.student_achievements is '生徒ごとに解除された実績';

create index if not exists student_achievements_student_id_idx
  on public.student_achievements (student_id);

alter table public.student_achievements enable row level security;

drop policy if exists "student_achievements_select_own" on public.student_achievements;
create policy "student_achievements_select_own"
  on public.student_achievements for select
  to authenticated
  using (student_id = auth.uid());

drop policy if exists "student_achievements_select_admin" on public.student_achievements;
create policy "student_achievements_select_admin"
  on public.student_achievements for select
  to authenticated
  using (public.is_admin());

drop policy if exists "student_achievements_insert_own" on public.student_achievements;
create policy "student_achievements_insert_own"
  on public.student_achievements for insert
  to authenticated
  with check (student_id = auth.uid());

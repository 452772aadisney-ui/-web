-- RLS の無限再帰を修正（プロフィールが読めない問題の原因）
-- Supabase Dashboard > SQL Editor で実行してください

-- 管理者判定（security definer で RLS をバイパス）
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 自分のロール取得（更新時の role 改ざん防止用）
create or replace function public.get_my_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- 問題のあったポリシーを差し替え
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = public.get_my_role()
  );

-- プロフィール未作成ユーザーがいれば修復（003 と同内容・再実行しても安全）
insert into public.profiles (id, email, full_name, display_name, role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', ''),
  coalesce(u.raw_user_meta_data ->> 'full_name', ''),
  'student'::public.user_role
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

update public.profiles
set student_code = public.generate_student_code()
where role = 'student' and student_code is null;

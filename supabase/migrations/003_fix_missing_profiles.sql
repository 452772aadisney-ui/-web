-- プロフィール未作成ユーザーの修復 + 自己修復用ポリシー
-- Supabase Dashboard > SQL Editor で実行してください

-- 自分の profiles 行を1回だけ作成可能（トリガー失敗時のセーフティネット）
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- 生徒プロフィール作成時に student_code を自動付与
create or replace function public.set_student_code_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is null then
    new.role := 'student';
  end if;

  if new.role = 'student' and new.student_code is null then
    new.student_code := public.generate_student_code();
  end if;

  if new.display_name is null or new.display_name = '' then
    new.display_name := coalesce(new.full_name, '');
  end if;

  if new.target_schools is null then
    new.target_schools := '{}';
  end if;

  if new.subjects is null then
    new.subjects := '{}';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_set_student_code on public.profiles;
create trigger profiles_set_student_code
  before insert on public.profiles
  for each row
  execute function public.set_student_code_on_insert();

-- 既存の auth.users で profiles が無いユーザーを修復
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

-- student_code が未設定の既存生徒に付与
update public.profiles
set student_code = public.generate_student_code()
where role = 'student' and student_code is null;

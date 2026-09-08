-- 059 rollback (destructive for the column only).
-- POLICY: Do NOT casually run this in Production.
-- Dropping full_name_kana deletes any kana values administrators entered.
-- Prefer leaving the nullable column in place if the app merely stops reading it.
-- This script does NOT delete profiles, student_code, full_name, or other data.

-- Restore handle_new_user to pre-059 shape (grade tag + no kana), matching 023.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  grade_tag_id uuid;
begin
  insert into public.profiles (id, email, full_name, role, student_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'student',
    public.generate_student_code()
  );

  grade_tag_id := nullif(new.raw_user_meta_data ->> 'grade_tag_id', '')::uuid;

  if grade_tag_id is not null then
    insert into public.profile_student_tags (profile_id, tag_id)
    select new.id, st.id
    from public.student_tags st
    where st.id = grade_tag_id
      and st.category = '学年'
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_full_name_kana on public.profiles;
drop function if exists public.protect_full_name_kana();

alter table public.profiles
  drop constraint if exists profiles_full_name_kana_length;

alter table public.profiles
  drop constraint if exists profiles_full_name_kana_not_blank;

-- WARNING: drops kana values. Profiles rows themselves are kept.
alter table public.profiles
  drop column if exists full_name_kana;

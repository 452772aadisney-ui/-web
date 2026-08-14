-- 浪人タグ追加 + 新規登録時の学年タグ自動付与
-- Supabase Dashboard > SQL Editor で実行してください

insert into public.student_tags (category, name) values
  ('学年', '浪人')
on conflict (category, name) do nothing;

-- 新規登録フォーム用: 学年タグのみ匿名閲覧可
drop policy if exists "student_tags_select_grade_anon" on public.student_tags;
create policy "student_tags_select_grade_anon"
  on public.student_tags for select to anon
  using (category = '学年');

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

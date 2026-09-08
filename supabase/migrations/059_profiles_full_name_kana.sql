-- 059: profiles.full_name_kana（氏名かな）
-- 管理者ソート用。既存行は backfill しない。DEFAULT なし。空文字は保存しない方針（アプリ側）。

alter table public.profiles
  add column if not exists full_name_kana text;

comment on column public.profiles.full_name_kana is
  '氏名の読み仮名（ひらがな）。五十音ソート用。nullable。生徒自身は変更不可（trigger）。';

-- 長さ上限（アプリ FULL_NAME_KANA_MAX_LENGTH と一致）
alter table public.profiles
  drop constraint if exists profiles_full_name_kana_length;

alter table public.profiles
  add constraint profiles_full_name_kana_length
  check (
    full_name_kana is null
    or char_length(full_name_kana) <= 80
  );

-- 空文字を拒否（null は可）
alter table public.profiles
  drop constraint if exists profiles_full_name_kana_not_blank;

alter table public.profiles
  add constraint profiles_full_name_kana_not_blank
  check (
    full_name_kana is null
    or length(btrim(full_name_kana)) > 0
  );

-- 生徒が自分のフルネームかなを書き換えられないようにする（student_code と同方針）
create or replace function public.protect_full_name_kana()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.full_name_kana is distinct from new.full_name_kana then
    if not exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    ) then
      new.full_name_kana := old.full_name_kana;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_full_name_kana on public.profiles;
create trigger profiles_protect_full_name_kana
  before update on public.profiles
  for each row
  execute function public.protect_full_name_kana();

-- 新規登録: metadata の full_name_kana を保存（アプリ側で正規化済み想定）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  grade_tag_id uuid;
  kana text;
begin
  kana := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name_kana', '')), '');

  insert into public.profiles (id, email, full_name, role, student_code, full_name_kana)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'student',
    public.generate_student_code(),
    kana
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

-- RLS / GRANT は変更しない（既存方針を維持）

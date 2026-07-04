-- 生徒プロフィール拡張 + 固有 student_code 発行
-- Supabase Dashboard > SQL Editor で実行してください

-- プロフィール列の追加
alter table public.profiles
  add column if not exists student_code text unique,
  add column if not exists display_name text not null default '',
  add column if not exists birthday date,
  add column if not exists target_schools text[] not null default '{}',
  add column if not exists subjects text[] not null default '{}';

comment on column public.profiles.student_code is '生徒固有ID（QRコード用）。student ロールのみ発行';
comment on column public.profiles.display_name is '表示名（アプリ内表示用）';
comment on column public.profiles.target_schools is '志望校リスト';
comment on column public.profiles.subjects is '使用科目リスト';

-- 生徒コード用シーケンス
create sequence if not exists public.student_code_seq start 1;

create or replace function public.generate_student_code()
returns text
language plpgsql
as $$
declare
  code text;
begin
  loop
    code := 'JS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.student_code_seq')::text, 6, '0');
    exit when not exists (select 1 from public.profiles where student_code = code);
  end loop;
  return code;
end;
$$;

-- 生徒コードの改ざん防止（本人・管理者以外は変更不可）
create or replace function public.protect_student_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.student_code is distinct from new.student_code then
    if not exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    ) then
      new.student_code := old.student_code;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_student_code on public.profiles;
create trigger profiles_protect_student_code
  before update on public.profiles
  for each row
  execute function public.protect_student_code();

-- 新規ユーザー作成時に student_code を付与
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, student_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'student',
    public.generate_student_code()
  );
  return new;
end;
$$;

-- 既存の生徒に student_code を付与（未設定のみ）
update public.profiles
set student_code = public.generate_student_code()
where role = 'student' and student_code is null;

-- student_code 検索用インデックス
create index if not exists profiles_student_code_idx on public.profiles (student_code);

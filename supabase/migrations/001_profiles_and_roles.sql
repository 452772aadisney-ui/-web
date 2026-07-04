-- 受験生web: ユーザープロフィールとロール管理
-- Supabase Dashboard > SQL Editor で実行してください

-- ロール enum
create type public.user_role as enum ('student', 'admin');

-- プロフィールテーブル（auth.users と 1:1）
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.user_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'ユーザープロフィール。Supabase Auth と連携し、生徒/管理者ロールを保持する';
comment on column public.profiles.role is 'student=生徒, admin=管理者。新規登録は常に student';

-- updated_at 自動更新
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.handle_updated_at();

-- 新規ユーザー登録時に profiles を自動作成
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'student'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- RLS 有効化
alter table public.profiles enable row level security;

-- 自分のプロフィールは閲覧可能
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- 管理者は全プロフィール閲覧可能
create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- 自分の full_name のみ更新可能（role はユーザー自身では変更不可）
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.profiles where id = auth.uid())
  );

-- 管理者は他ユーザーの role を更新可能
create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- インデックス
create index profiles_role_idx on public.profiles (role);

-- 最初の管理者を手動で作成する例（Supabase Auth でユーザーを作成後に実行）:
-- update public.profiles set role = 'admin' where email = 'admin@example.com';

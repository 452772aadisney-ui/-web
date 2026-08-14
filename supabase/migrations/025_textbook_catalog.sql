-- 管理者本棚（参考書カタログ）と生徒教材の拡張
-- Supabase Dashboard > SQL Editor で実行してください

create table if not exists public.textbook_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subjects text[] not null default '{}',
  usage_tags text[] not null default '{}',
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint textbook_catalog_name_not_empty check (char_length(trim(name)) > 0)
);

comment on table public.textbook_catalog is '管理者本棚の参考書マスタ';
comment on column public.textbook_catalog.visibility is 'public=全員が選択可, private=登録者と管理者のみ';

create index if not exists textbook_catalog_visibility_idx
  on public.textbook_catalog (visibility);

drop trigger if exists textbook_catalog_updated_at on public.textbook_catalog;
create trigger textbook_catalog_updated_at
  before update on public.textbook_catalog
  for each row
  execute function public.handle_updated_at();

alter table public.textbooks
  add column if not exists catalog_id uuid references public.textbook_catalog (id) on delete set null,
  add column if not exists registered_by uuid references public.profiles (id) on delete set null,
  add column if not exists is_seen_by_student boolean not null default true;

comment on column public.textbooks.catalog_id is '本棚マスタから選択した場合の参照';
comment on column public.textbooks.registered_by is '登録したユーザー（管理者登録時に設定）';
comment on column public.textbooks.is_seen_by_student is '生徒が本棚で確認済みか';

create index if not exists textbooks_catalog_id_idx on public.textbooks (catalog_id);

create unique index if not exists textbooks_student_catalog_unique
  on public.textbooks (student_id, catalog_id)
  where catalog_id is not null;

alter table public.textbook_catalog enable row level security;

drop policy if exists "textbook_catalog_select" on public.textbook_catalog;
create policy "textbook_catalog_select"
  on public.textbook_catalog for select
  to authenticated
  using (
    public.is_admin()
    or visibility = 'public'
    or exists (
      select 1
      from public.textbooks t
      where t.catalog_id = textbook_catalog.id
        and t.student_id = auth.uid()
    )
  );

drop policy if exists "textbook_catalog_insert_admin" on public.textbook_catalog;
create policy "textbook_catalog_insert_admin"
  on public.textbook_catalog for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "textbook_catalog_update_admin" on public.textbook_catalog;
create policy "textbook_catalog_update_admin"
  on public.textbook_catalog for update
  to authenticated
  using (public.is_admin());

drop policy if exists "textbook_catalog_delete_admin" on public.textbook_catalog;
create policy "textbook_catalog_delete_admin"
  on public.textbook_catalog for delete
  to authenticated
  using (public.is_admin());

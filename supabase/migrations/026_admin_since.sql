-- 管理者昇格日時（未読バッジ等のカットオフに使用）

alter table public.profiles
  add column if not exists admin_since timestamptz;

comment on column public.profiles.admin_since is '管理者に昇格した日時。チャット未読バッジ等のカットオフに使用';

-- 既存の管理者はマイグレーション実行時点を昇格日とみなす
update public.profiles
set admin_since = now()
where role = 'admin'
  and admin_since is null;

create or replace function public.handle_profile_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'admin' and old.role is distinct from 'admin' then
    new.admin_since = now();
  elsif new.role = 'student' and old.role = 'admin' then
    new.admin_since = null;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_role_change on public.profiles;

create trigger profiles_role_change
  before update on public.profiles
  for each row
  when (old.role is distinct from new.role)
  execute function public.handle_profile_role_change();

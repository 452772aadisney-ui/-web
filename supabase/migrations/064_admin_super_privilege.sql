-- 064: Super admin privilege + graduate access helpers + audit
-- Apply after 063. Does not seed any super admin (see rollout md).
--
-- precheck: supabase/queries/064_admin_super_privilege_precheck.sql
-- verify:   supabase/queries/064_admin_super_privilege_verify.sql
-- rollback: supabase/rollbacks/064_admin_super_privilege_rollback.sql
--           (precheck: supabase/rollbacks/064_admin_super_privilege_precheck.sql)
-- rollout:  docs/admin-super-privilege-rollout.md
--
-- Defaults: is_super_admin = false for all rows (existing + new).
-- is_admin() unchanged. New is_super_admin() / admin_can_access_student().

-- ---------------------------------------------------------------------------
-- Column
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

comment on column public.profiles.is_super_admin is
  'true = 大管理者. Only meaningful when role=admin. Default false.';

-- Students must never carry the flag
update public.profiles
set is_super_admin = false
where role <> 'admin' and is_super_admin = true;

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER, locked search_path, revoke from anon/authenticated)
-- ---------------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_super_admin = true
  );
$$;

revoke all on function public.is_super_admin() from public;
revoke all on function public.is_super_admin() from anon, authenticated;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.is_kisotsu_student(p_student_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profile_student_tags pst
    join public.student_tags st on st.id = pst.tag_id
    where pst.profile_id = p_student_id
      and st.category = '学年'
      and st.name = '既卒'
  );
$$;

revoke all on function public.is_kisotsu_student(uuid) from public;
revoke all on function public.is_kisotsu_student(uuid) from anon, authenticated;
grant execute on function public.is_kisotsu_student(uuid) to authenticated;

-- Admin may access a student row iff super, or regular admin and not 既卒.
create or replace function public.admin_can_access_student(p_student_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin()
    and (
      public.is_super_admin()
      or not public.is_kisotsu_student(p_student_id)
    );
$$;

revoke all on function public.admin_can_access_student(uuid) from public;
revoke all on function public.admin_can_access_student(uuid) from anon, authenticated;
grant execute on function public.admin_can_access_student(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Protect is_super_admin / role escalation on generic profile updates
-- ---------------------------------------------------------------------------
create or replace function public.protect_admin_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_super boolean;
  super_count integer;
begin
  actor_is_super := public.is_super_admin();

  -- Non-super cannot change is_super_admin or promote/demote role to/from admin
  if not actor_is_super then
    if new.is_super_admin is distinct from old.is_super_admin then
      raise exception 'is_super_admin can only be changed by a super admin';
    end if;
    if new.role is distinct from old.role then
      raise exception 'role can only be changed by a super admin';
    end if;
  end if;

  -- Students never keep super flag
  if new.role <> 'admin' then
    new.is_super_admin := false;
  end if;

  -- Block removing the last super admin (demote flag or role change)
  if old.is_super_admin = true and old.role = 'admin'
     and (new.is_super_admin = false or new.role <> 'admin') then
    select count(*)::integer into super_count
    from public.profiles
    where role = 'admin' and is_super_admin = true and id <> old.id;

    if super_count < 1 then
      raise exception 'cannot remove the last super admin';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_admin_privilege on public.profiles;
create trigger profiles_protect_admin_privilege
  before update on public.profiles
  for each row
  execute function public.protect_admin_privilege_columns();

revoke all on function public.protect_admin_privilege_columns() from public;
revoke all on function public.protect_admin_privilege_columns() from anon, authenticated;

-- Block insert of is_super_admin=true except by super (or service_role with no auth.uid)
create or replace function public.protect_admin_privilege_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> 'admin' then
    new.is_super_admin := false;
  elsif new.is_super_admin = true and auth.uid() is not null and not public.is_super_admin() then
    raise exception 'is_super_admin can only be set by a super admin';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_admin_privilege_insert on public.profiles;
create trigger profiles_protect_admin_privilege_insert
  before insert on public.profiles
  for each row
  execute function public.protect_admin_privilege_insert();

revoke all on function public.protect_admin_privilege_insert() from public;
revoke all on function public.protect_admin_privilege_insert() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Atomic promote/demote among existing admins (last-super-admin safe)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_privilege_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  target_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('promote_super', 'demote_super')),
  before_is_super_admin boolean not null,
  after_is_super_admin boolean not null,
  created_at timestamptz not null default now()
);

comment on table public.admin_privilege_audit is
  'Audit log for super-admin promote/demote. Do not delete for rollback of app code.';

alter table public.admin_privilege_audit enable row level security;

drop policy if exists "admin_privilege_audit_select_super" on public.admin_privilege_audit;
create policy "admin_privilege_audit_select_super"
  on public.admin_privilege_audit for select to authenticated
  using (public.is_super_admin());

-- no insert/update/delete policies for authenticated — only SECURITY DEFINER RPC writes

revoke all on table public.admin_privilege_audit from anon, authenticated;
grant select on table public.admin_privilege_audit to authenticated;

create or replace function public.set_admin_super_privilege(
  p_target_id uuid,
  p_make_super boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role public.user_role;
  target_was_super boolean;
  remaining integer;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'super admin required';
  end if;

  if p_target_id = auth.uid() and p_make_super = false then
    -- self-demote allowed only if another super remains (checked below)
    null;
  end if;

  select role, is_super_admin
    into target_role, target_was_super
  from public.profiles
  where id = p_target_id
  for update;

  if not found then
    raise exception 'target not found';
  end if;

  if target_role <> 'admin' then
    raise exception 'target must already be an admin';
  end if;

  if target_was_super = p_make_super then
    return; -- no-op
  end if;

  if p_make_super = false then
    select count(*)::integer into remaining
    from public.profiles
    where role = 'admin' and is_super_admin = true and id <> p_target_id;

    if remaining < 1 then
      raise exception 'cannot demote the last super admin';
    end if;
  end if;

  update public.profiles
  set is_super_admin = p_make_super,
      updated_at = now()
  where id = p_target_id;

  insert into public.admin_privilege_audit (
    actor_id, target_id, action, before_is_super_admin, after_is_super_admin
  ) values (
    auth.uid(),
    p_target_id,
    case when p_make_super then 'promote_super' else 'demote_super' end,
    target_was_super,
    p_make_super
  );
end;
$$;

revoke all on function public.set_admin_super_privilege(uuid, boolean) from public;
revoke all on function public.set_admin_super_privilege(uuid, boolean) from anon, authenticated;
grant execute on function public.set_admin_super_privilege(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles SELECT: regular admins cannot see 既卒 student rows
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (
    public.is_super_admin()
    or (
      public.is_admin()
      and (
        id = auth.uid()
        or role = 'admin'
        or not public.is_kisotsu_student(id)
      )
    )
  );

-- Admins still update via policy, but privilege columns protected by trigger
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (
    public.is_super_admin()
    or (
      public.is_admin()
      and (
        id = auth.uid()
        or role = 'admin'
        or not public.is_kisotsu_student(id)
      )
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.is_admin()
      and (
        id = auth.uid()
        or role = 'admin'
        or not public.is_kisotsu_student(id)
      )
    )
  );

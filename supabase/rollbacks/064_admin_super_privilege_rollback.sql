-- 064 rollback（破壊的）
-- POLICY: 本番では原則実行しない。既定の復旧はアプリ戻し + 列/監査表の残置。
--
-- WARNING:
-- - DROP public.admin_privilege_audit → promote/demote 監査履歴が消える
-- - DROP profiles.is_super_admin → 大管理者フラグが消える
-- - 065 が残っていると依存オブジェクトが壊れる → 先に 065 rollback
--
-- Precheck: supabase/rollbacks/064_admin_super_privilege_precheck.sql
-- Rollout:  docs/admin-super-privilege-rollout.md

-- Restore pre-064 profiles admin policies (is_admin only)
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

drop trigger if exists profiles_protect_admin_privilege on public.profiles;
drop trigger if exists profiles_protect_admin_privilege_insert on public.profiles;

drop function if exists public.set_admin_super_privilege(uuid, boolean);
drop function if exists public.protect_admin_privilege_columns();
drop function if exists public.protect_admin_privilege_insert();
drop function if exists public.admin_can_access_student(uuid);
drop function if exists public.is_kisotsu_student(uuid);
drop function if exists public.is_super_admin();

-- WARNING: deletes audit history
drop table if exists public.admin_privilege_audit;

-- WARNING: drops privilege flags
alter table public.profiles
  drop column if exists is_super_admin;

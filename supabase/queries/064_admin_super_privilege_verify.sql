-- 064 読み取り専用 verify（件数・オブジェクト存在のみ、PIIなし）
-- Expect all status = PASS after 064. Bootstrap of first super admin is separate
-- (docs/admin-super-privilege-rollout.md). super_admin_count may be 0 here.

with cols as (
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'is_super_admin'
  ) as has_col,
  (
    select a.attnotnull
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'profiles'
      and a.attname = 'is_super_admin'
      and a.attnum > 0
      and not a.attisdropped
  ) as is_not_null
),
fns as (
  select
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_super_admin' and p.pronargs = 0
    ) as has_is_super_admin,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_kisotsu_student'
        and oidvectortypes(p.proargtypes) = 'uuid'
    ) as has_is_kisotsu_student,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'admin_can_access_student'
        and oidvectortypes(p.proargtypes) = 'uuid'
    ) as has_admin_can_access_student,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'set_admin_super_privilege'
        and oidvectortypes(p.proargtypes) = 'uuid, boolean'
    ) as has_set_admin_super_privilege,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'protect_admin_privilege_columns'
    ) as has_protect_update_fn,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'protect_admin_privilege_insert'
    ) as has_protect_insert_fn
),
trigs as (
  select
    exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'profiles'
        and t.tgname = 'profiles_protect_admin_privilege'
        and not t.tgisinternal
    ) as has_update_trg,
    exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'profiles'
        and t.tgname = 'profiles_protect_admin_privilege_insert'
        and not t.tgisinternal
    ) as has_insert_trg
),
audit as (
  select
    to_regclass('public.admin_privilege_audit') is not null as has_table,
    coalesce(
      (
        select c.relrowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'admin_privilege_audit'
      ),
      false
    ) as rls_enabled,
    exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'admin_privilege_audit'
        and policyname = 'admin_privilege_audit_select_super'
    ) as has_select_policy
),
policies as (
  select
    exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'profiles'
        and policyname = 'profiles_select_admin'
    ) as has_select_admin,
    exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'profiles'
        and policyname = 'profiles_update_admin'
    ) as has_update_admin
),
non_admin_super as (
  select count(*)::bigint as n
  from public.profiles
  where role <> 'admin' and is_super_admin = true
)
select
  'profiles_is_super_admin_column'::text as check_name,
  case
    when (select has_col from cols) and coalesce((select is_not_null from cols), false)
      then 'PASS'
    else 'FAIL'
  end as status,
  'not null boolean'::text as details

union all

select
  'is_super_admin_fn'::text,
  case when (select has_is_super_admin from fns) then 'PASS' else 'FAIL' end,
  'is_super_admin()'::text

union all

select
  'is_kisotsu_student_fn'::text,
  case when (select has_is_kisotsu_student from fns) then 'PASS' else 'FAIL' end,
  'is_kisotsu_student(uuid)'::text

union all

select
  'admin_can_access_student_fn'::text,
  case when (select has_admin_can_access_student from fns) then 'PASS' else 'FAIL' end,
  'admin_can_access_student(uuid)'::text

union all

select
  'set_admin_super_privilege_fn'::text,
  case when (select has_set_admin_super_privilege from fns) then 'PASS' else 'FAIL' end,
  'set_admin_super_privilege(uuid,boolean)'::text

union all

select
  'protect_admin_privilege_triggers'::text,
  case
    when (select has_protect_update_fn from fns)
     and (select has_protect_insert_fn from fns)
     and (select has_update_trg from trigs)
     and (select has_insert_trg from trigs)
      then 'PASS'
    else 'FAIL'
  end,
  'update+insert triggers'::text

union all

select
  'admin_privilege_audit'::text,
  case
    when (select has_table from audit)
     and (select rls_enabled from audit)
     and (select has_select_policy from audit)
      then 'PASS'
    else 'FAIL'
  end,
  'table+rls+select_super'::text

union all

select
  'profiles_admin_policies_present'::text,
  case
    when (select has_select_admin from policies)
     and (select has_update_admin from policies)
      then 'PASS'
    else 'FAIL'
  end,
  'profiles_select_admin / profiles_update_admin'::text

union all

select
  'no_non_admin_super_flag'::text,
  case when (select n from non_admin_super) = 0 then 'PASS' else 'FAIL' end,
  format('non_admin_super_rows=%s', (select n from non_admin_super))

union all

select
  'super_admin_count_info'::text,
  'INFO'::text,
  (
    select count(*)::text
    from public.profiles
    where role = 'admin' and is_super_admin = true
  );

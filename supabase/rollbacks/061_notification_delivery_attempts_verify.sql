-- 061 読み取り専用 verify（PIIなし）

select
  'notification_delivery_attempts_exists'::text as check_name,
  case
    when to_regclass('public.notification_delivery_attempts') is not null
      then 'PASS'
    else 'FAIL'
  end as status,
  coalesce(to_regclass('public.notification_delivery_attempts')::text, '') as details

union all

select
  'notification_delivery_status_has_unknown'::text,
  case
    when exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname = 'notification_delivery_status'
        and e.enumlabel = 'unknown'
    ) then 'PASS'
    else 'FAIL'
  end,
  'unknown'::text

union all

select
  'notification_delivery_attempts_pending_uidx'::text,
  case
    when exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and indexname = 'notification_delivery_attempts_one_pending_uidx'
    ) then 'PASS'
    else 'FAIL'
  end,
  'one_pending_uidx'::text

union all

select
  'notification_delivery_attempts_rls_enabled'::text,
  case
    when exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'notification_delivery_attempts'
        and c.relrowsecurity
    ) then 'PASS'
    else 'FAIL'
  end,
  'rls'::text

union all

select
  'notification_delivery_attempts_no_anon_grants'::text,
  case
    when not exists (
      select 1
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'notification_delivery_attempts'
        and grantee in ('anon', 'authenticated')
        and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    ) then 'PASS'
    else 'FAIL'
  end,
  'revoke_anon_authenticated'::text;

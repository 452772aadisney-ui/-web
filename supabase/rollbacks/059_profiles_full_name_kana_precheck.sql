-- 059 precheck (read-only). Run before applying 059.
-- Do not print PII (names / kana / emails).

select
  (select count(*)::bigint from public.profiles) as profiles_total,
  (
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'full_name_kana'
  ) as full_name_kana_column_present,
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'protect_full_name_kana'
  ) as protect_fn_present;

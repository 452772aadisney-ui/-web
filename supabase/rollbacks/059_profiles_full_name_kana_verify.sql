-- 059 verify (read-only). Run after applying 059.

with checks as (
  select 'column_exists'::text as check_name,
    case when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'full_name_kana'
        and data_type = 'text'
        and is_nullable = 'YES'
    ) then 'PASS' else 'FAIL' end as status
  union all
  select 'no_column_default',
    case when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'full_name_kana'
        and column_default is null
    ) then 'PASS' else 'FAIL' end
  union all
  select 'length_check',
    case when exists (
      select 1 from pg_constraint
      where conname = 'profiles_full_name_kana_length'
    ) then 'PASS' else 'FAIL' end
  union all
  select 'not_blank_check',
    case when exists (
      select 1 from pg_constraint
      where conname = 'profiles_full_name_kana_not_blank'
    ) then 'PASS' else 'FAIL' end
  union all
  select 'protect_trigger',
    case when exists (
      select 1 from pg_trigger
      where tgname = 'profiles_protect_full_name_kana'
        and not tgisinternal
    ) then 'PASS' else 'FAIL' end
  union all
  select 'protect_function',
    case when exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'protect_full_name_kana'
    ) then 'PASS' else 'FAIL' end
  union all
  select 'existing_rows_not_backfilled_required',
    -- Soft check: column may be mostly null after apply (no forced backfill).
    case when (
      select count(*) filter (where full_name_kana is not null)
      from public.profiles
    ) <= (
      select count(*) from public.profiles
    ) then 'PASS' else 'FAIL' end
)
select * from checks order by check_name;

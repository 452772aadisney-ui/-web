-- 054_class_schedule_notifications 適用後の読み取り専用検証
-- Supabase Dashboard > SQL Editor で一括実行。DB を変更しません。

with
enum_has_class_schedule as (
  select exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'push_notification_type'
      and e.enumlabel = 'class_schedule'
  ) as ok
),
prefs_column as (
  select
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notification_preferences'
        and column_name = 'class_schedule'
    ) as col_exists,
    (
      select column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notification_preferences'
        and column_name = 'class_schedule'
    ) as col_default,
    (
      select is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notification_preferences'
        and column_name = 'class_schedule'
    ) as col_nullable
),
audit_check as (
  select pg_get_constraintdef(c.oid) as def
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'notification_preference_changes'
    and c.conname = 'notification_preference_changes_category_check'
),
checks as (
  select
    'enum_has_class_schedule'::text as check_name,
    case when (select ok from enum_has_class_schedule) then 'PASS' else 'FAIL' end as status,
    jsonb_build_object('ok', (select ok from enum_has_class_schedule)) as details

  union all
  select
    'prefs_class_schedule_column',
    case
      when (select col_exists from prefs_column)
       and (select col_nullable from prefs_column) = 'NO'
       and coalesce((select col_default from prefs_column), '') like '%true%'
      then 'PASS' else 'FAIL'
    end,
    jsonb_build_object(
      'exists', (select col_exists from prefs_column),
      'nullable', (select col_nullable from prefs_column),
      'default', (select col_default from prefs_column)
    )

  union all
  select
    'audit_category_includes_class_schedule',
    case
      when coalesce((select def from audit_check), '') like '%class_schedule%'
      then 'PASS' else 'FAIL'
    end,
    jsonb_build_object('constraint', (select def from audit_check))
)
select * from checks
order by check_name;

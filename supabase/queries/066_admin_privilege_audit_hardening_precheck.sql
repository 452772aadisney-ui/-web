-- 066 読み取り専用 precheck（適用前）
-- Expect: 065 objects PRESENT; 066 objects ABSENT; no destructive changes.

select
  '065_audience_scope'::text as check_name,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'announcements'
      and column_name = 'audience_scope'
  ) then 'PRESENT' else 'ABSENT' end as status,
  '065 must be applied before 066'::text as note
union all
select
  '066_comment_at_read',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'study_day_feedback_reads'
      and column_name = 'comment_at_read'
  ) then 'PRESENT' else 'ABSENT' end,
  'Expect ABSENT before 066'
union all
select
  '066_last_super_delete_trigger',
  case when exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'profiles'
      and t.tgname = 'profiles_protect_last_super_delete'
      and not t.tgisinternal
  ) then 'PRESENT' else 'ABSENT' end,
  'Expect ABSENT before 066'
union all
select
  'stale_announcement_target_students_world_select',
  case when exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'announcement_target_students'
      and policyname = 'announcement_target_students_select'
      and coalesce(qual, '') = 'true'
  ) then 'STALE_BROAD' else 'OK_OR_MISSING' end,
  'World-readable select should be replaced by 066';

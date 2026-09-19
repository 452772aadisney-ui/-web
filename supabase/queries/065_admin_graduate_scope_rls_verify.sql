-- 065 読み取り専用 verify（オブジェクト存在・制約のみ、PIIなし）
-- Expect all status = PASS after 065.

with cols as (
  select
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'announcements'
        and column_name = 'audience_scope'
    ) as has_col,
    (
      select a.attnotnull
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'announcements'
        and a.attname = 'audience_scope'
        and a.attnum > 0
        and not a.attisdropped
    ) as is_not_null,
    exists (
      select 1 from pg_constraint
      where conname = 'announcements_audience_scope_check'
    ) as has_check
),
null_scopes as (
  select count(*)::bigint as n
  from public.announcements
  where audience_scope is null
),
fns as (
  select
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'sync_announcement_audience_scope'
    ) as has_sync_fn,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'announcement_includes_kisotsu'
        and oidvectortypes(p.proargtypes) = 'uuid'
    ) as has_includes_kisotsu,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'admin_can_manage_announcement'
        and oidvectortypes(p.proargtypes) = 'uuid'
    ) as has_manage_announcement,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'protect_kisotsu_tag_mutations'
    ) as has_protect_kisotsu
),
trigs as (
  select
    exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'announcements'
        and t.tgname = 'announcements_sync_audience_scope'
        and not t.tgisinternal
    ) as has_sync_trg,
    exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'student_tags'
        and t.tgname = 'student_tags_protect_kisotsu'
        and not t.tgisinternal
    ) as has_tags_trg,
    exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'profile_student_tags'
        and t.tgname = 'profile_student_tags_protect_kisotsu'
        and not t.tgisinternal
    ) as has_pst_trg
),
policies as (
  select
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'announcements'
        and policyname = 'announcements_select'
    ) as has_ann_select,
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'study_logs'
        and policyname = 'study_logs_select_admin'
    ) as has_study_logs,
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'chat_messages'
        and policyname = 'chat_messages_select_admin'
    ) as has_chat,
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'class_schedule_days'
        and policyname = 'class_schedule_days_insert_admin'
    ) as has_cs_insert,
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'class_schedule_sessions'
        and policyname = 'class_schedule_sessions_insert_admin'
    ) as has_css_insert
),
rpc_src as (
  select
    coalesce(
      (
        select pg_get_functiondef(p.oid)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'bump_class_schedule_notify_revision'
          and oidvectortypes(p.proargtypes) = 'uuid, uuid'
      ),
      ''
    ) as bump_def,
    coalesce(
      (
        select pg_get_functiondef(p.oid)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'create_class_schedule_day_with_sessions'
          and oidvectortypes(p.proargtypes) = 'date, text, text, jsonb, uuid'
      ),
      ''
    ) as create_def
)
select
  'announcements_audience_scope'::text as check_name,
  case
    when (select has_col from cols)
     and coalesce((select is_not_null from cols), false)
     and (select has_check from cols)
     and (select n from null_scopes) = 0
      then 'PASS'
    else 'FAIL'
  end as status,
  format('null_scopes=%s', (select n from null_scopes)) as details

union all

select
  'audience_scope_sync_trigger'::text,
  case
    when (select has_sync_fn from fns) and (select has_sync_trg from trigs)
      then 'PASS'
    else 'FAIL'
  end,
  'announcements_sync_audience_scope'::text

union all

select
  'announcement_helper_fns'::text,
  case
    when (select has_includes_kisotsu from fns)
     and (select has_manage_announcement from fns)
      then 'PASS'
    else 'FAIL'
  end,
  'includes_kisotsu + manage_announcement'::text

union all

select
  'announcements_select_policy'::text,
  case when (select has_ann_select from policies) then 'PASS' else 'FAIL' end,
  'announcements_select'::text

union all

select
  'student_scoped_admin_policies'::text,
  case
    when (select has_study_logs from policies) and (select has_chat from policies)
      then 'PASS'
    else 'FAIL'
  end,
  'study_logs / chat_messages select_admin'::text

union all

select
  'kisotsu_tag_protection'::text,
  case
    when (select has_protect_kisotsu from fns)
     and (select has_tags_trg from trigs)
     and (select has_pst_trg from trigs)
      then 'PASS'
    else 'FAIL'
  end,
  'student_tags + profile_student_tags triggers'::text

union all

select
  'class_schedule_admin_policies'::text,
  case
    when (select has_cs_insert from policies) and (select has_css_insert from policies)
      then 'PASS'
    else 'FAIL'
  end,
  'class_schedule insert policies present'::text

union all

select
  'class_schedule_rpc_super_admin_gate'::text,
  case
    when (select bump_def from rpc_src) ilike '%super admin actor required%'
     and (select create_def from rpc_src) ilike '%super admin actor required%'
      then 'PASS'
    else 'FAIL'
  end,
  'bump + create_class_schedule 5-arg'::text;

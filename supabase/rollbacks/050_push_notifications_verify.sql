-- 050_push_notifications 適用後の読み取り専用検証
-- Supabase Dashboard > SQL Editor でこのファイル全体を一括実行してください。
-- DB を変更しません。結果は check_name / status / details の1表のみです。

with
expected_tables as (
  select unnest(array[
    'push_subscriptions',
    'notification_preferences',
    'notification_events',
    'notification_deliveries'
  ]) as table_name
),
expected_enums as (
  select *
  from (
    values
      ('push_notification_type'),
      ('notification_delivery_channel'),
      ('notification_delivery_status')
  ) as e(typname)
),
existing_tables as (
  select c.relname as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in (select table_name from expected_tables)
),
table_existence as (
  select
    'tables_exist'::text as check_name,
    case
      when (
        select count(*) from expected_tables
      ) = (
        select count(*) from existing_tables
      )
      then 'PASS'
      else 'FAIL'
    end as status,
    jsonb_build_object(
      'expected', (select jsonb_agg(table_name order by table_name) from expected_tables),
      'found', coalesce((select jsonb_agg(table_name order by table_name) from existing_tables), '[]'::jsonb),
      'missing', coalesce((
        select jsonb_agg(e.table_name order by e.table_name)
        from expected_tables e
        left join existing_tables x on x.table_name = e.table_name
        where x.table_name is null
      ), '[]'::jsonb)
    ) as details
),
enum_labels as (
  select
    t.typname,
    array_agg(e.enumlabel order by e.enumsortorder) as labels
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  join pg_enum e on e.enumtypid = t.oid
  where n.nspname = 'public'
    and t.typname in (select typname from expected_enums)
  group by t.typname
),
enum_existence as (
  select
    'enums_exist_with_test'::text as check_name,
    case
      when (
        select count(*) from expected_enums e
        where exists (select 1 from enum_labels l where l.typname = e.typname)
      ) = 3
      and exists (
        select 1
        from enum_labels
        where typname = 'push_notification_type'
          and 'test' = any (labels)
      )
      then 'PASS'
      else 'FAIL'
    end as status,
    jsonb_build_object(
      'expected_enums', (select jsonb_agg(typname order by typname) from expected_enums),
      'found', coalesce((
        select jsonb_object_agg(typname, to_jsonb(labels))
        from enum_labels
      ), '{}'::jsonb),
      'missing_enums', coalesce((
        select jsonb_agg(e.typname order by e.typname)
        from expected_enums e
        where not exists (select 1 from enum_labels l where l.typname = e.typname)
      ), '[]'::jsonb),
      'push_notification_type_has_test', exists (
        select 1
        from enum_labels
        where typname = 'push_notification_type'
          and 'test' = any (labels)
      )
    ) as details
),
rls_rows as (
  select
    e.table_name,
    coalesce(c.relrowsecurity, false) as rls_enabled
  from expected_tables e
  left join pg_class c
    on c.relname = e.table_name
   and c.relkind = 'r'
  left join pg_namespace n
    on n.oid = c.relnamespace
   and n.nspname = 'public'
),
rls_enabled as (
  select
    'rls_enabled_all_tables'::text as check_name,
    case
      when bool_and(rls_enabled) then 'PASS'
      else 'FAIL'
    end as status,
    jsonb_build_object(
      'tables', coalesce((
        select jsonb_agg(
          jsonb_build_object('table', table_name, 'rls_enabled', rls_enabled)
          order by table_name
        )
        from rls_rows
      ), '[]'::jsonb),
      'missing_or_disabled', coalesce((
        select jsonb_agg(table_name order by table_name)
        from rls_rows
        where not rls_enabled
      ), '[]'::jsonb)
    ) as details
  from rls_rows
),
pref_policies as (
  select
    policyname,
    cmd,
    roles::text as roles,
    qual,
    with_check
  from pg_policies
  where schemaname = 'public'
    and tablename = 'notification_preferences'
),
pref_own_policies as (
  select
    'notification_preferences_own_policies'::text as check_name,
    case
      when exists (
        select 1 from pref_policies
        where policyname = 'notification_preferences_select_own'
          and cmd = 'SELECT'
          and roles like '%authenticated%'
          and coalesce(qual, '') like '%auth.uid()%'
      )
      and exists (
        select 1 from pref_policies
        where policyname = 'notification_preferences_insert_own'
          and cmd = 'INSERT'
          and roles like '%authenticated%'
          and coalesce(with_check, '') like '%auth.uid()%'
      )
      and exists (
        select 1 from pref_policies
        where policyname = 'notification_preferences_update_own'
          and cmd = 'UPDATE'
          and roles like '%authenticated%'
          and coalesce(qual, '') like '%auth.uid()%'
          and coalesce(with_check, '') like '%auth.uid()%'
      )
      then 'PASS'
      else 'FAIL'
    end as status,
    jsonb_build_object(
      'policies', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'policyname', policyname,
            'cmd', cmd,
            'roles', roles,
            'qual', qual,
            'with_check', with_check
          )
          order by policyname
        )
        from pref_policies
      ), '[]'::jsonb)
    ) as details
),
pref_no_delete_policy as (
  select
    'notification_preferences_no_delete_policy'::text as check_name,
    case
      when not exists (
        select 1 from pref_policies where cmd = 'DELETE'
      )
      then 'PASS'
      else 'FAIL'
    end as status,
    jsonb_build_object(
      'delete_policies', coalesce((
        select jsonb_agg(policyname order by policyname)
        from pref_policies
        where cmd = 'DELETE'
      ), '[]'::jsonb)
    ) as details
),
pref_grants as (
  select grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'notification_preferences'
    and grantee in ('anon', 'authenticated', 'PUBLIC')
),
pref_auth_grants as (
  select
    'notification_preferences_authenticated_grants'::text as check_name,
    case
      when (
        select count(distinct privilege_type)
        from pref_grants
        where grantee = 'authenticated'
          and privilege_type in ('SELECT', 'INSERT', 'UPDATE')
      ) = 3
      then 'PASS'
      else 'FAIL'
    end as status,
    jsonb_build_object(
      'authenticated_privileges', coalesce((
        select jsonb_agg(privilege_type order by privilege_type)
        from pref_grants
        where grantee = 'authenticated'
      ), '[]'::jsonb),
      'required', jsonb_build_array('SELECT', 'INSERT', 'UPDATE')
    ) as details
),
pref_auth_no_delete_grant as (
  select
    'notification_preferences_authenticated_no_delete'::text as check_name,
    case
      when not exists (
        select 1
        from pref_grants
        where grantee = 'authenticated'
          and privilege_type = 'DELETE'
      )
      then 'PASS'
      else 'FAIL'
    end as status,
    jsonb_build_object(
      'authenticated_delete', exists (
        select 1
        from pref_grants
        where grantee = 'authenticated'
          and privilege_type = 'DELETE'
      )
    ) as details
),
pref_anon_no_grants as (
  select
    'notification_preferences_anon_no_grants'::text as check_name,
    case
      when not exists (
        select 1 from pref_grants where grantee = 'anon'
      )
      then 'PASS'
      else 'FAIL'
    end as status,
    jsonb_build_object(
      'anon_privileges', coalesce((
        select jsonb_agg(privilege_type order by privilege_type)
        from pref_grants
        where grantee = 'anon'
      ), '[]'::jsonb)
    ) as details
),
restricted_tables as (
  select unnest(array[
    'push_subscriptions',
    'notification_events',
    'notification_deliveries'
  ]) as table_name
),
restricted_grants as (
  select table_name, grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (select table_name from restricted_tables)
    and grantee in ('anon', 'authenticated')
),
restricted_policies as (
  select tablename, policyname, cmd
  from pg_policies
  where schemaname = 'public'
    and tablename in (select table_name from restricted_tables)
),
restricted_client_access as (
  select
    'restricted_tables_no_client_access'::text as check_name,
    case
      when not exists (select 1 from restricted_grants)
       and not exists (select 1 from restricted_policies)
      then 'PASS'
      else 'FAIL'
    end as status,
    jsonb_build_object(
      'grants', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'table', table_name,
            'grantee', grantee,
            'privilege', privilege_type
          )
          order by table_name, grantee, privilege_type
        )
        from restricted_grants
      ), '[]'::jsonb),
      'policies', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'table', tablename,
            'policy', policyname,
            'cmd', cmd
          )
          order by tablename, policyname
        )
        from restricted_policies
      ), '[]'::jsonb)
    ) as details
),
target_path_def as (
  select pg_get_constraintdef(c.oid) as definition
  from pg_constraint c
  join pg_class rel on rel.oid = c.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and rel.relname = 'notification_events'
    and c.conname = 'notification_events_target_path_dashboard'
),
target_path_check as (
  select
    'notification_events_target_path_constraint'::text as check_name,
    case
      when exists (select 1 from target_path_def)
       and (
         position($$= '/dashboard'$$ in (select definition from target_path_def)) > 0
         or position($$= '/dashboard'::text$$ in (select definition from target_path_def)) > 0
       )
       and position($$'/dashboard/%'$$ in (select definition from target_path_def)) > 0
       and position($$'/dashboard?%'$$ in (select definition from target_path_def)) > 0
      then 'PASS'
      else 'FAIL'
    end as status,
    jsonb_build_object(
      'constraint', 'notification_events_target_path_dashboard',
      'definition', coalesce((select definition from target_path_def), null),
      'requires', jsonb_build_array(
        'target_path = ''/dashboard''',
        'target_path like/~~ ''/dashboard/%''',
        'target_path like/~~ ''/dashboard?%'''
      )
    ) as details
),
pk_rows as (
  select
    e.table_name,
    exists (
      select 1
      from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
      where n.nspname = 'public'
        and rel.relname = e.table_name
        and c.contype = 'p'
    ) as has_pk
  from expected_tables e
),
fk_expected as (
  select *
  from (
    values
      ('push_subscriptions', 'user_id', 'profiles'),
      ('notification_preferences', 'user_id', 'profiles'),
      ('notification_events', 'user_id', 'profiles'),
      ('notification_deliveries', 'event_id', 'notification_events'),
      ('notification_deliveries', 'subscription_id', 'push_subscriptions')
  ) as f(table_name, column_name, ref_table)
),
fk_found as (
  select
    rel.relname as table_name,
    a.attname as column_name,
    confrel.relname as ref_table
  from pg_constraint c
  join pg_class rel on rel.oid = c.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  join pg_class confrel on confrel.oid = c.confrelid
  join lateral unnest(c.conkey) with ordinality as ck(attnum, ord) on true
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attnum = ck.attnum
  where n.nspname = 'public'
    and c.contype = 'f'
    and rel.relname in (select table_name from expected_tables)
),
unique_expected as (
  select *
  from (
    values
      ('push_subscriptions', 'push_subscriptions_endpoint_unique'),
      ('notification_events', 'notification_events_idempotency_unique')
  ) as u(table_name, constraint_name)
),
unique_found as (
  select
    rel.relname as table_name,
    c.conname as constraint_name
  from pg_constraint c
  join pg_class rel on rel.oid = c.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and c.contype = 'u'
    and rel.relname in (select table_name from expected_tables)
),
index_expected as (
  select *
  from (
    values
      ('push_subscriptions_user_active_idx', true),
      ('push_subscriptions_user_id_idx', false),
      ('notification_events_user_type_created_idx', false),
      ('notification_deliveries_event_subscription_uidx', true),
      ('notification_deliveries_event_email_uidx', true),
      ('notification_deliveries_event_id_idx', false),
      ('notification_deliveries_subscription_id_idx', true)
  ) as i(index_name, must_be_partial)
),
index_found as (
  select
    i.relname as index_name,
    pg_get_indexdef(i.oid) as indexdef,
    (xi.indpred is not null) as is_partial
  from pg_class i
  join pg_namespace n on n.oid = i.relnamespace
  join pg_index xi on xi.indexrelid = i.oid
  where n.nspname = 'public'
    and i.relkind = 'i'
    and i.relname in (select index_name from index_expected)
),
constraints_and_indexes as (
  select
    'constraints_and_indexes'::text as check_name,
    case
      when (select bool_and(has_pk) from pk_rows)
       and not exists (
         select 1
         from fk_expected e
         left join fk_found f
           on f.table_name = e.table_name
          and f.column_name = e.column_name
          and f.ref_table = e.ref_table
         where f.table_name is null
       )
       and not exists (
         select 1
         from unique_expected e
         left join unique_found u
           on u.table_name = e.table_name
          and u.constraint_name = e.constraint_name
         where u.table_name is null
       )
       and not exists (
         select 1
         from index_expected e
         left join index_found f on f.index_name = e.index_name
         where f.index_name is null
            or (e.must_be_partial and not f.is_partial)
       )
      then 'PASS'
      else 'FAIL'
    end as status,
    jsonb_build_object(
      'primary_keys', coalesce((
        select jsonb_agg(
          jsonb_build_object('table', table_name, 'has_pk', has_pk)
          order by table_name
        )
        from pk_rows
      ), '[]'::jsonb),
      'foreign_keys_missing', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'table', e.table_name,
            'column', e.column_name,
            'ref_table', e.ref_table
          )
          order by e.table_name, e.column_name
        )
        from fk_expected e
        left join fk_found f
          on f.table_name = e.table_name
         and f.column_name = e.column_name
         and f.ref_table = e.ref_table
        where f.table_name is null
      ), '[]'::jsonb),
      'unique_constraints_missing', coalesce((
        select jsonb_agg(e.constraint_name order by e.constraint_name)
        from unique_expected e
        left join unique_found u
          on u.table_name = e.table_name
         and u.constraint_name = e.constraint_name
        where u.table_name is null
      ), '[]'::jsonb),
      'indexes', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'index', e.index_name,
            'found', f.index_name is not null,
            'must_be_partial', e.must_be_partial,
            'is_partial', coalesce(f.is_partial, false),
            'definition', f.indexdef
          )
          order by e.index_name
        )
        from index_expected e
        left join index_found f on f.index_name = e.index_name
      ), '[]'::jsonb)
    ) as details
),
subscription_fk as (
  select
    c.conname,
    c.confdeltype,
    pg_get_constraintdef(c.oid) as definition
  from pg_constraint c
  join pg_class rel on rel.oid = c.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  join lateral unnest(c.conkey) with ordinality as ck(attnum, ord) on true
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attnum = ck.attnum
  where n.nspname = 'public'
    and rel.relname = 'notification_deliveries'
    and c.contype = 'f'
    and a.attname = 'subscription_id'
),
subscription_set_null as (
  select
    'notification_deliveries_subscription_set_null'::text as check_name,
    case
      when exists (
        select 1 from subscription_fk where confdeltype = 'n'
      )
      then 'PASS'
      else 'FAIL'
    end as status,
    jsonb_build_object(
      -- confdeltype: a=NO ACTION, r=RESTRICT, c=CASCADE, n=SET NULL, d=SET DEFAULT
      'foreign_keys', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'name', conname,
            'confdeltype', confdeltype,
            'definition', definition
          )
        )
        from subscription_fk
      ), '[]'::jsonb)
    ) as details
),
idempotency as (
  select
    'notification_events_idempotency_unique'::text as check_name,
    case
      when exists (
        select 1
        from pg_constraint c
        join pg_class rel on rel.oid = c.conrelid
        join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public'
          and rel.relname = 'notification_events'
          and c.conname = 'notification_events_idempotency_unique'
          and c.contype = 'u'
          and pg_get_constraintdef(c.oid) like '%user_id%'
          and pg_get_constraintdef(c.oid) like '%notification_type%'
          and pg_get_constraintdef(c.oid) like '%idempotency_key%'
      )
      then 'PASS'
      else 'FAIL'
    end as status,
    jsonb_build_object(
      'constraint', 'notification_events_idempotency_unique',
      'definition', (
        select pg_get_constraintdef(c.oid)
        from pg_constraint c
        join pg_class rel on rel.oid = c.conrelid
        join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public'
          and rel.relname = 'notification_events'
          and c.conname = 'notification_events_idempotency_unique'
        limit 1
      )
    ) as details
),
all_checks as (
  select * from table_existence
  union all select * from enum_existence
  union all select * from rls_enabled
  union all select * from pref_own_policies
  union all select * from pref_no_delete_policy
  union all select * from pref_auth_grants
  union all select * from pref_auth_no_delete_grant
  union all select * from pref_anon_no_grants
  union all select * from restricted_client_access
  union all select * from target_path_check
  union all select * from constraints_and_indexes
  union all select * from subscription_set_null
  union all select * from idempotency
)
select
  check_name,
  status,
  details
from all_checks
order by
  case status when 'FAIL' then 0 else 1 end,
  check_name;

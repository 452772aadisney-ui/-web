-- 050 適用後の RLS / 権限 / 制約確認用（SQL Editor）
-- 本番適用前の検証用。本番へは慎重に。テスト用ユーザーで実行すること。
-- ※ 050 は開発手順としてリポジトリに置くが、依頼どおり未適用のままにしてよい。

-- 1) テーブル存在と RLS
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'push_subscriptions',
    'notification_preferences',
    'notification_events',
    'notification_deliveries'
  )
order by 1;

-- 2) 050 新設 enum（3つ）の存在確認
select t.typname
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typname in (
    'push_notification_type',
    'notification_delivery_channel',
    'notification_delivery_status'
  )
order by 1;

-- 3) preferences ポリシー（select/insert/update own のみ想定。delete ポリシーなし）
select polname, cmd, roles::text
from pg_policies
where schemaname = 'public'
  and tablename = 'notification_preferences'
order by polname;

-- 4) preferences の実効 GRANT（authenticated: SELECT/INSERT/UPDATE。DELETE なし。anon なし）
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'notification_preferences'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by grantee, privilege_type;

-- 5) 他3テーブルは一般ロールへ GRANT がないこと（または実質利用不可）
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'push_subscriptions',
    'notification_events',
    'notification_deliveries'
  )
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_name, grantee, privilege_type;

-- 6) 他3テーブルにポリシーが無いこと（deny by default）
select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
  and tablename in (
    'push_subscriptions',
    'notification_events',
    'notification_deliveries'
  )
group by tablename;

-- 7) target_path 制約が /dashboard% 単純一致でないこと（定義を目視）
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.notification_events'::regclass
  and conname = 'notification_events_target_path_dashboard';

-- 8) 一意制約・インデックス
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'push_subscriptions',
    'notification_preferences',
    'notification_events',
    'notification_deliveries'
  )
order by tablename, indexname;

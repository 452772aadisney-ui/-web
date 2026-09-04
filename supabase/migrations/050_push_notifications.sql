-- Web Push 基盤テーブル（購読・設定・イベント・配信結果）
-- Supabase Dashboard > SQL Editor で実行してください
--
-- 操作方針（重要）:
-- - push_subscriptions / notification_events / notification_deliveries は
--   ブラウザ用 anon/authenticated クライアントから直接操作させない。
-- - 後工程の Server Action で getUser() により本人確認したうえで、
--   server-only の Admin Client（service role）経由でのみ購読・イベントを操作する。
-- - service role は RLS を迂回するため、認証・入力検証前に用いてはならない。
-- - notification_preferences のみ、ログイン本人が RLS 経由で参照・更新できる。

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'push_notification_type' and n.nspname = 'public'
  ) then
    create type public.push_notification_type as enum (
      'study_reminder',
      'announcement',
      'message',
      'coaching_reminder',
      'test'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'notification_delivery_channel' and n.nspname = 'public'
  ) then
    create type public.notification_delivery_channel as enum (
      'push',
      'email'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'notification_delivery_status' and n.nspname = 'public'
  ) then
    create type public.notification_delivery_status as enum (
      'pending',
      'sent',
      'failed',
      'skipped'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  failure_count integer not null default 0 check (failure_count >= 0),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint),
  constraint push_subscriptions_endpoint_nonempty check (char_length(trim(endpoint)) > 0),
  constraint push_subscriptions_p256dh_nonempty check (char_length(trim(p256dh)) > 0),
  constraint push_subscriptions_auth_nonempty check (char_length(trim(auth)) > 0)
);

comment on table public.push_subscriptions is '端末単位の Web Push 購読。鍵・endpoint はクライアントへ露出しない。操作は Admin Client 経由のみ。';
comment on column public.push_subscriptions.disabled_at is '非 null なら無効。404/410・明示解除時に設定。failure_count だけでは自動無効化しない。';
comment on column public.push_subscriptions.failure_count is '連続失敗回数の記録用。自動無効化の直接条件には使わない。';

create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id)
  where disabled_at is null;

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

drop trigger if exists push_subscriptions_updated_at on public.push_subscriptions;
create trigger push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function public.handle_updated_at();

alter table public.push_subscriptions enable row level security;

-- 一般クライアント向けポリシーは意図的に作成しない（全操作 deny）
revoke all on table public.push_subscriptions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- notification_preferences
-- ---------------------------------------------------------------------------

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  study_reminder boolean not null default true,
  announcement boolean not null default true,
  message boolean not null default true,
  coaching_reminder boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notification_preferences is '生徒ごとの通知種別オン/オフ。Push 許可・購読の有無とは別。未取得時は送信しない。';
comment on column public.notification_preferences.study_reminder is '学習記録未入力リマインダー';
comment on column public.notification_preferences.announcement is '新規お知らせ';
comment on column public.notification_preferences.message is '新規メッセージ（管理者→生徒）';
comment on column public.notification_preferences.coaching_reminder is 'コーチング予約の催促';

drop trigger if exists notification_preferences_updated_at on public.notification_preferences;
create trigger notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.handle_updated_at();

alter table public.notification_preferences enable row level security;

-- 実効権限: authenticated は select/insert/update のみ（delete 不可）。anon は不可。
-- 行の可視性・更新可否は RLS（user_id = auth.uid()）で制限する。
revoke all on table public.notification_preferences from anon, authenticated;
grant select, insert, update on table public.notification_preferences to authenticated;

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
  on public.notification_preferences for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own"
  on public.notification_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
  on public.notification_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE は許可しない（行はユーザー削除 CASCADE で消える）

-- ---------------------------------------------------------------------------
-- notification_events
-- ---------------------------------------------------------------------------

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  notification_type public.push_notification_type not null,
  idempotency_key text not null,
  title text not null,
  body text not null,
  target_path text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint notification_events_idempotency_unique
    unique (user_id, notification_type, idempotency_key),
  constraint notification_events_idempotency_key_nonempty
    check (char_length(trim(idempotency_key)) > 0),
  constraint notification_events_title_nonempty
    check (char_length(trim(title)) > 0),
  constraint notification_events_body_nonempty
    check (char_length(trim(body)) > 0),
  constraint notification_events_target_path_dashboard
    check (
      char_length(target_path) between 1 and 512
      and target_path !~ E'[\\x00-\\x1F\\x7F]'
      and target_path !~* '^(javascript|data|vbscript):'
      and target_path not like '//%'
      and (
        target_path = '/dashboard'
        or target_path like '/dashboard/%'
        or target_path like '/dashboard?%'
      )
    )
);

comment on table public.notification_events is '論理通知イベントと冪等性。クライアント直接操作不可。Admin Client 経由のみ。';
comment on column public.notification_events.idempotency_key is '種別内で一意なキー（例: JST日付 / announcement_id / message_id / week_start / test uuid）';
comment on column public.notification_events.target_path is '同一オリジン想定。許可: /dashboard ・ /dashboard/... ・ /dashboard?... 。/dashboard-evil・外部URL・制御文字は不可';
comment on column public.notification_events.metadata is '機微情報を含めない補助データ（JSON）';

create index if not exists notification_events_user_type_created_idx
  on public.notification_events (user_id, notification_type, created_at desc);

alter table public.notification_events enable row level security;

revoke all on table public.notification_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- notification_deliveries
-- ---------------------------------------------------------------------------

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notification_events (id) on delete cascade,
  channel public.notification_delivery_channel not null,
  subscription_id uuid references public.push_subscriptions (id) on delete set null,
  status public.notification_delivery_status not null default 'pending',
  http_status integer,
  error_code text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  sent_at timestamptz,
  succeeded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- subscription_id は ON DELETE SET NULL のため、push 行でも null になり得る。
  -- 送信時の必須はアプリ層で保証する（購読物理削除後も履歴を壊さないため）。
  constraint notification_deliveries_email_no_subscription
    check (channel <> 'email' or subscription_id is null),
  constraint notification_deliveries_error_code_length
    check (error_code is null or char_length(error_code) <= 100)
);

comment on table public.notification_deliveries is 'イベントごとの端末別/メール別配信結果。endpoint・鍵は保存しない。';
comment on column public.notification_deliveries.subscription_id is '購読削除時は SET NULL。履歴は残す。';
comment on column public.notification_deliveries.error_code is 'gone / transient / invalid 等の安全な分類のみ。秘密情報禁止。';

-- Push: 同一イベント×同一購読は1行
create unique index if not exists notification_deliveries_event_subscription_uidx
  on public.notification_deliveries (event_id, subscription_id)
  where channel = 'push' and subscription_id is not null;

-- Email: 同一イベントにつきメール配信は1行
create unique index if not exists notification_deliveries_event_email_uidx
  on public.notification_deliveries (event_id)
  where channel = 'email';

create index if not exists notification_deliveries_event_id_idx
  on public.notification_deliveries (event_id);

create index if not exists notification_deliveries_subscription_id_idx
  on public.notification_deliveries (subscription_id)
  where subscription_id is not null;

drop trigger if exists notification_deliveries_updated_at on public.notification_deliveries;
create trigger notification_deliveries_updated_at
  before update on public.notification_deliveries
  for each row execute function public.handle_updated_at();

alter table public.notification_deliveries enable row level security;

revoke all on table public.notification_deliveries from anon, authenticated;

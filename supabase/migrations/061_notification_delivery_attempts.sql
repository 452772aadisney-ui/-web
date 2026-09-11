-- 通知配信の試行履歴（失敗内容を上書きせず永続化）
-- Supabase Dashboard > SQL Editor で実行してください
--
-- 適用順: 060_coaching_schedule_revision.sql の後
-- precheck: supabase/rollbacks/061_notification_delivery_attempts_precheck.sql
-- verify:   supabase/rollbacks/061_notification_delivery_attempts_verify.sql
-- rollback: supabase/rollbacks/061_notification_delivery_attempts_rollback.sql
--           （通常復旧: DROP せず履歴保持。アプリ戻しが基本）
-- destructive purge（履歴削除・通常ではない）:
--   supabase/rollbacks/061_notification_delivery_attempts_destructive_purge.sql
-- rollout:  supabase/rollbacks/060_061_coaching_reschedule_notify_rollout.md
--
-- RLS / GRANT は緩めない（Admin Client / service_role のみ）。関数は追加しない。
-- 既存 notification_deliveries 行は削除・更新しない（attempts 表の追加のみ）。
--
-- enum 'unknown':
--   ADD VALUE のみ。本ファイル内では新 enum 値を列制約や UPDATE で使わない
--   （同一トランザクション内で新値を参照すると環境によって適用エラーになるため）。
--   attempts.status は text。アプリが deliveries.status='unknown' を書くのは
--   本 migration コミット後。
--
-- 旧アプリと unknown:
--   classifyExistingDeliveries は unknown を sent/failed/pending と見ない → proceed。
--   既存 email 行があると claim が unique 衝突し already_completed と誤判定し得る。
--   「enum が残るだけで旧アプリ互換」とは断定しない（rollout / rollback 参照）。
--
-- 切り替え中: 060→061 適用後〜新アプリ確認完了まで予約変更を控える（rollout md）。
-- 「予約変更の完全停止は不要」とは保証しない。停止用の新機能は実装しない。

-- delivery 集約ステータスに unknown（受付済みか不明）を追加
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'notification_delivery_status'
      and e.enumlabel = 'unknown'
  ) then
    alter type public.notification_delivery_status add value 'unknown';
  end if;
end $$;

create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null
    references public.notification_deliveries (id) on delete cascade,
  attempt_no integer not null check (attempt_no >= 1),
  -- pending: 送信権獲得済み / sent / failed / unknown: 受付済みか不明
  status text not null
    check (status in ('pending', 'sent', 'failed', 'unknown')),
  -- not_accepted: プロバイダが明確に拒否 / accepted: 2xx / unknown: 切断等
  acceptance text
    check (acceptance is null or acceptance in ('not_accepted', 'accepted', 'unknown')),
  http_status integer,
  error_code text
    check (error_code is null or char_length(error_code) <= 100),
  provider_message_id text
    check (provider_message_id is null or char_length(provider_message_id) <= 200),
  claim_token uuid not null default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notification_delivery_attempts_delivery_no_uidx
    unique (delivery_id, attempt_no)
);

comment on table public.notification_delivery_attempts is
  'notification_deliveries の各送信試行。失敗履歴は行を追加して保持し、上書きしない。';
comment on column public.notification_delivery_attempts.claim_token is
  '送信権を取得した処理だけが完了更新できる識別子';
comment on column public.notification_delivery_attempts.acceptance is
  'not_accepted=確実な未受付 / accepted=プロバイダ受付 / unknown=受付済みか不明';

-- 同時再送: 1 delivery につき pending 試行は1件だけ
create unique index if not exists notification_delivery_attempts_one_pending_uidx
  on public.notification_delivery_attempts (delivery_id)
  where status = 'pending';

create index if not exists notification_delivery_attempts_delivery_id_idx
  on public.notification_delivery_attempts (delivery_id, attempt_no desc);

alter table public.notification_delivery_attempts enable row level security;

revoke all on table public.notification_delivery_attempts from anon, authenticated;

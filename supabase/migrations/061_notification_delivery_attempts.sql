-- 通知配信の試行履歴（失敗内容を上書きせず永続化）
-- Supabase Dashboard > SQL Editor で実行してください
--
-- 適用順: 060_coaching_schedule_revision.sql の後
-- RLS / GRANT は緩めない（Admin Client のみ）

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

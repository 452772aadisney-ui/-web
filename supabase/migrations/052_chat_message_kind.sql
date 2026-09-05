-- 052: Distinguish normal chat vs coaching booking reminders (NOT applied to production by this task).
-- Required before deploying message Push-first allowlist/all modes that rely on message_kind.

alter table public.chat_messages
  add column if not exists message_kind text not null default 'user';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_messages_message_kind_check'
  ) then
    alter table public.chat_messages
      add constraint chat_messages_message_kind_check
      check (message_kind in ('user', 'coaching_booking_reminder'));
  end if;
end $$;

comment on column public.chat_messages.message_kind is
  'user = normal chat; coaching_booking_reminder = admin bulk booking催促 via sendCoachingBookingReminders';

create index if not exists chat_messages_student_kind_created_idx
  on public.chat_messages (student_id, message_kind, created_at desc);

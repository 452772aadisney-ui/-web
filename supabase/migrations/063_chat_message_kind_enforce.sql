-- 063: Harden chat message_kind so clients cannot self-assign system kinds
-- Supabase Dashboard > SQL Editor で実行してください
--
-- Unread badges filter message_kind = 'user'. Students (and any non-admin
-- session) must not insert non-user kinds to evade normal chat handling.
-- Admins may still insert coaching_booking_reminder via trusted server paths.
--
-- Does not rewrite historical rows. Pre-052 rows already defaulted to 'user'.

create or replace function public.enforce_chat_message_kind_on_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.message_kind := 'user';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_messages_enforce_message_kind on public.chat_messages;
create trigger chat_messages_enforce_message_kind
  before insert or update of message_kind on public.chat_messages
  for each row
  execute function public.enforce_chat_message_kind_on_write();

revoke all on function public.enforce_chat_message_kind_on_write() from public;
revoke all on function public.enforce_chat_message_kind_on_write() from anon, authenticated;

comment on function public.enforce_chat_message_kind_on_write() is
  'Force message_kind=user for non-admin writers; admins may set system kinds.';

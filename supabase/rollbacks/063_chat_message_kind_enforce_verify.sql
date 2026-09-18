-- 063 verify (read-only)

select
  'chat_messages_enforce_message_kind_trigger'::text as check_name,
  case
    when exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'chat_messages'
        and t.tgname = 'chat_messages_enforce_message_kind'
        and not t.tgisinternal
    ) then 'PASS'
    else 'FAIL'
  end as status,
  'before insert/update trigger'::text as details;

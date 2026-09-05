-- Verify 052 chat_messages.message_kind (read-only).

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_messages'
      and column_name = 'message_kind'
  ) as has_message_kind_column,
  exists (
    select 1
    from pg_constraint
    where conname = 'chat_messages_message_kind_check'
  ) as has_message_kind_check;

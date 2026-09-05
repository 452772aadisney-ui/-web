-- Rollback 052 chat_messages.message_kind (do not run in production unless intentionally rolling back).

drop index if exists public.chat_messages_student_kind_created_idx;

alter table public.chat_messages
  drop constraint if exists chat_messages_message_kind_check;

alter table public.chat_messages
  drop column if exists message_kind;

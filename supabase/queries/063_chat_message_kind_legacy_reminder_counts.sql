-- READ-ONLY investigation: historical booking-reminder-like chat rows labeled as user.
-- Do NOT run an UPDATE / backfill from this file.
-- Body-only matching is approximate; report counts only.

-- 1) Kind distribution
select
  message_kind,
  count(*)::bigint as message_count
from public.chat_messages
group by message_kind
order by message_kind;

-- 2) Rows that look like the fixed booking-reminder copy but are kind=user
--    (likely pre-052 auto messages, or human paste of the same text)
select
  count(*)::bigint as user_kind_reminder_like_count
from public.chat_messages
where message_kind = 'user'
  and body like '今週のコーチング予約が入っていません%';

-- 3) Same body already stored as system kind
select
  count(*)::bigint as system_kind_reminder_count
from public.chat_messages
where message_kind = 'coaching_booking_reminder';

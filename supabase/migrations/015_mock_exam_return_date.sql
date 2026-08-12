-- 模試の返却日
-- Supabase Dashboard > SQL Editor で実行してください

alter table public.exam_schedules
  add column if not exists return_on date;

comment on column public.exam_schedules.return_on is '模試の返却日（模試のみ）';

create index if not exists exam_schedules_return_on_idx on public.exam_schedules (return_on);

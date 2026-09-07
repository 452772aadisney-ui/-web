-- 058: Drop legacy 7-arg create_class_schedule_day_with_sessions
--
-- APPLY ONLY AFTER:
--   1) 057 applied + verify PASS
--   2) New app (5-arg RPC) deployed and create-from-admin verified in Production
--   3) No remaining callers of the 7-arg signature
--
-- Do NOT apply in the same window as 057. See rollout.md.

drop function if exists public.create_class_schedule_day_with_sessions(
  date, text, text, text, text, jsonb, uuid
);

-- Keep 6-arg absent (belt and suspenders).
drop function if exists public.create_class_schedule_day_with_sessions(
  date, text, text, text, text, jsonb
);

comment on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) is
  'service_role のみ。p_location_details 任意。旧7引数互換 RPC は 058 で削除済み。';

revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) from public;
revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) from anon;
revoke all on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) from authenticated;
grant execute on function public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid) to service_role;

notify pgrst, 'reload schema';

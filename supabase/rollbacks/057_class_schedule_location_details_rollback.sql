-- 057 rollback guidance (documented only — no automatic destructive SQL).
--
-- Preferred recovery if 057 must be undone before new app deploy:
-- 1) Keep or restore 7-arg create RPC (056 body is enough for old app).
-- 2) Optionally DROP 5-arg overload only:
--      drop function if exists public.create_class_schedule_day_with_sessions(date, text, text, jsonb, uuid);
-- 3) Do NOT DROP location_details until app no longer reads it.
-- 4) Dropping CHECKs (time_grid / subject_valid) is optional and should be
--    rare — prefer fixing app validation instead.
-- 5) NEVER DROP TABLE. NEVER CASCADE.
-- 6) location_details backfill is additive; reversing it is lossy if old columns
--    were already null on new writes.
--
-- After 058: restoring 7-arg requires re-applying the 7-arg CREATE from 057
-- (compat section), not 056 alone if location_details is NOT NULL on inserts.

select '057 rollback is documented only; no automatic destructive SQL'::text as note;

# Class schedule 057/058 zero-downtime rollout

Do **not** apply 057 and 058 in the same change window. Do **not** drop the
7-arg RPC until the new app is verified in Production.

## Why dual RPC

| Step | Old Production (7-arg) | New app (5-arg) |
|------|------------------------|-----------------|
| Before 057 | Works | Would fail (no 5-arg / no column) |
| After 057, before deploy | Still works (compat 7-arg kept) | Ready once deployed |
| After new deploy | Unused | Works via 5-arg |
| After 058 | Removed | Only path |

## Order

1. **Optional precheck** (read-only; works **before or after** 057):
   `supabase/rollbacks/057_class_schedule_location_details_precheck.sql`
   Expect `ready_for_057 = 1` (all time/subject invalid counts = 0).
   `location_details_column_present` is `0` pre-057 and `1` post-057.
   Record `days_total`, `sessions_total`, `notify_revision_sum`,
   `days_backfill_candidates` (no PII).

2. **Apply 057** (migration only — no app deploy yet).

3. **Verify 057**:
   `supabase/rollbacks/057_class_schedule_location_details_verify.sql`
   Expect dual overloads (5-arg + 7-arg), both `service_role` only, backfill PASS,
   time/subject CHECKs PASS. Compare row counts / `notify_revision_sum` to precheck
   (migration must not bump revisions or delete rows).

4. **Compat smoke without inserting real student-facing data** (preferred):
   - Confirm PostgREST/schema sees both overloads (verify SQL above).
   - Optionally call 7-arg RPC in a **transaction that rolls back**, or against a
     staging clone — do not leave extra Production days if avoidable.
   - Old Production UI create path should still resolve the 7-arg signature.

5. **Push + deploy** the new app (5-arg + `location_details` UI).

6. **Verify new path**: admin create via new UI; confirm `location_details` saved;
   student「次の授業」shows the full day; delivery mode still `legacy` (no Push/email).

7. **Apply 058 only after** step 6 succeeds:  
   `058_drop_legacy_class_schedule_create_rpc.sql`

8. **Verify 058**:  
   `supabase/rollbacks/058_drop_legacy_class_schedule_create_rpc_verify.sql`

## Off-grid times vs UI

057 aborts if any existing session is off the 5-minute grid or outside 08:00–23:00.
After a successful 057, Production cannot retain off-grid rows, so the admin UI
“preserve original off-grid values” path is a safety net only; new/edited times
must satisfy the DB CHECK (same rules as the app selects).

## Notify

Migration backfill and CHECK adds must **not** change `notify_revision`.
UI-only deploys must not bump revisions without field changes.

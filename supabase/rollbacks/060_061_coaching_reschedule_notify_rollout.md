# Coaching schedule revision + notify attempts (060 / 061) rollout

Do **not** treat old/new app coexistence as fully concurrency-safe.
Old Production does **not** honor `schedule_revision`, GWS `If-Match`, or
`notification_delivery_attempts`. Do **not** claim that booking changes can
continue freely during cutover.

## Production order

1. **Announce freeze (ops)**  
   From DB apply through new-app verify, ask **students and admins** to avoid
   coaching booking create / change / cancel. Old tabs left open can still
   submit; after cutover, ask users to **reload the page**.

2. **Precheck 060** (read-only):  
   `supabase/rollbacks/060_coaching_schedule_revision_precheck.sql`

3. **Apply 060**:  
   `supabase/migrations/060_coaching_schedule_revision.sql`

4. **Verify 060**:  
   `supabase/rollbacks/060_coaching_schedule_revision_verify.sql`  
   Expect PASS (columns present, no null `schedule_revision`).

5. **Precheck 061** (read-only; expects 060 present):  
   `supabase/rollbacks/061_notification_delivery_attempts_precheck.sql`

6. **Apply 061**:  
   `supabase/migrations/061_notification_delivery_attempts.sql`

7. **Verify 061**:  
   `supabase/rollbacks/061_notification_delivery_attempts_verify.sql`  
   Expect PASS (table, enum `unknown`, pending unique index, RLS, no anon/auth grants).

8. **Deploy new app** (revision lock, If-Match, attempts, GWS ownership, email idempotency).

9. **Smoke** without bulk real student mail if possible; confirm admin reschedule
   path and calendar sync on a controlled booking. Then lift the freeze and ask
   open sessions to **reload**.

## Safe recovery (history kept)

1. Revert **app** to previous release.
2. **Do not** drop `notification_delivery_attempts` or 060 columns by default.
3. Run guidance only:  
   `supabase/rollbacks/061_notification_delivery_attempts_rollback.sql`  
   (no DROP).
4. Optional data hygiene before/while on old app: rows with
   `notification_deliveries.status = 'unknown'` may be misread by old
   `classifyExistingDeliveries` (treated like proceed → claim exists →
   `already_completed`, so no retry). Consider manually setting those to
   `failed` while preserving `error_code` if ops need a clear terminal state.
5. Leaving enum label `unknown` in Postgres is **not** by itself “compatible”;
   behavior above matters.

## Destructive purge (separate)

Only with explicit approval — erases attempt history:  
`supabase/rollbacks/061_notification_delivery_attempts_destructive_purge.sql`

060 column drop (also destructive; avoid while any app may read them):  
`supabase/rollbacks/060_coaching_schedule_revision_rollback.sql`

## Cutover constraints (no new freeze feature)

- No in-app “stop booking changes” switch is required; use ops communication.
- Old UI + new UI overlapping writers can skip revision bumps / If-Match /
  ownership props → calendar or notify races. Freeze covers this window.
- After new app is live, reload avoids stale client actions from old bundles.

# profiles.full_name_kana (059) rollout

Do **not** apply this migration as part of an automated Production deploy in this
change set unless ops explicitly schedules it. App code that reads/writes
`full_name_kana` should ship **after** 059 is applied (or behind a soft null
fallback — this app treats missing kana as null).

## Rollback data policy

- Rollback that **drops the column** deletes administrator-entered kana values.
- Prefer **not** rolling back the column if the only issue is app behavior:
  leave the nullable column and revert app code instead.
- Rollback must **never** delete `profiles` rows or mutate `full_name` /
  `student_code` / tags.

## Safe Production order

1. **Precheck** (read-only):
   `supabase/rollbacks/059_profiles_full_name_kana_precheck.sql`
   Expect `full_name_kana_column_present = 0` before apply. Record `profiles_total`.

2. **Apply 059** in SQL Editor / migration pipeline:
   `supabase/migrations/059_profiles_full_name_kana.sql`
   No backfill. Existing rows stay `full_name_kana = null`.

3. **Verify**:
   `supabase/rollbacks/059_profiles_full_name_kana_verify.sql`
   All checks `PASS`. Confirm `profiles_total` unchanged vs precheck.

4. **Deploy app** that:
   - Requires kana on signup
   - Lets admins edit kana on student detail
   - Sorts admin student list / proxy picker by kana

5. Admins gradually fill kana for existing students (optional; unset stays listed).

## Permissions

059 does **not** alter RLS or table GRANTs on `profiles`. Students still cannot
change `full_name_kana` (trigger mirrors `student_code` protection). Only an
authenticated **admin** session updating via existing admin paths succeeds.
`protect_full_name_kana()` EXECUTE is revoked from `anon` / `authenticated`
(trigger still runs).

## Old app while 059 is live

Old Production signup does not send `full_name_kana` metadata → column stays
`null` → signup still succeeds. Invalid metadata is coerced to `null` inside
`handle_new_user` so auth/profile creation cannot desync on CHECK failure.

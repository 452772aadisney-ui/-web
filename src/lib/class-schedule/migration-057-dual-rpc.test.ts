import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

function read(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), 'utf8')
}

describe('057 dual-RPC and verify artifacts', () => {
  const migration = read(
    'supabase/migrations/057_class_schedule_location_details.sql',
  )
  const verify = read(
    'supabase/rollbacks/057_class_schedule_location_details_verify.sql',
  )
  const precheck = read(
    'supabase/rollbacks/057_class_schedule_location_details_precheck.sql',
  )
  const rollout = read(
    'supabase/rollbacks/057_class_schedule_location_details_rollout.md',
  )

  it('keeps both overloads during bridge and documents zero-downtime order', () => {
    expect(migration).toMatch(/COMPAT \(pre-058\)/)
    expect(migration).toMatch(/auth\.role\(\) is distinct from 'service_role'/)
    expect(verify).toMatch(/create_rpc_dual_overloads/)
    expect(verify).toMatch(/create_rpc_7arg_service_role_only/)
    expect(verify).toMatch(/backfill_no_legacy_left_null/)
    expect(verify).toMatch(/session_time_grid_constraint/)
    expect(precheck).toMatch(/time_out_of_range_or_off_grid/)
    expect(precheck).toMatch(/notify_revision_sum/)
    expect(rollout).toMatch(/Apply 058 only after/)
    expect(rollout).toMatch(/Do \*\*not\*\* apply 057 and 058 in the same/)
  })

  it('backfill is idempotent and ordered address → map_url → room_note', () => {
    expect(migration).toMatch(/where csd\.location_details is null/)
    expect(migration).toMatch(/csd\.address[\s\S]*csd\.map_url[\s\S]*csd\.room_note/)
  })
})

describe('058 cleanup verify artifact', () => {
  it('asserts 5-arg only after cleanup', () => {
    const verify = read(
      'supabase/rollbacks/058_drop_legacy_class_schedule_create_rpc_verify.sql',
    )
    expect(verify).toMatch(/create_rpc_5arg_only/)
    expect(verify).toMatch(/create_rpc_7arg_absent/)
  })
})

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function createRpcBodies(): string[] {
  return [
    read('supabase/migrations/053_class_schedule.sql'),
    read('supabase/migrations/055_repair_class_schedule_partial_migration.sql'),
    read('supabase/migrations/056_fix_class_schedule_create_rpc_ambiguous_columns.sql'),
  ]
}

describe('create_class_schedule_day_with_sessions ambiguous column fix', () => {
  it('qualifies RETURNING as csd.id, csd.notify_revision in 053/055/056', () => {
    for (const sql of createRpcBodies()) {
      expect(sql).toMatch(
        /returning\s+csd\.id\s*,\s*csd\.notify_revision/i,
      )
      expect(sql).not.toMatch(
        /returning\s+id\s*,\s*notify_revision\s*\n\s*into/i,
      )
    }
  })

  it('keeps 7-arg signature, service_role-only grant, and no CASCADE drops in 056', () => {
    const sql = read(
      'supabase/migrations/056_fix_class_schedule_create_rpc_ambiguous_columns.sql',
    )
    expect(sql).toContain('p_actor_id uuid')
    expect(sql).toContain('returns table (day_id uuid, notify_revision integer)')
    expect(sql).toMatch(/auth\.role\(\) is distinct from 'service_role'/)
    expect(sql).toMatch(
      /grant execute on function public\.create_class_schedule_day_with_sessions\(date, text, text, text, text, jsonb, uuid\) to service_role/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.create_class_schedule_day_with_sessions\(date, text, text, text, text, jsonb, uuid\) from authenticated/i,
    )
    expect(sql).not.toMatch(/drop\s+function[\s\S]*cascade/i)
    expect(sql).not.toMatch(/drop\s+table/i)
    expect(sql).toContain("notify pgrst, 'reload schema'")
    expect(sql).toContain(
      'drop function if exists public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb)',
    )
  })

  it('056 verify checks qualified returning and privileges', () => {
    const verify = read(
      'supabase/rollbacks/056_fix_class_schedule_create_rpc_ambiguous_columns_verify.sql',
    )
    expect(verify).toContain('create_rpc_returning_qualified')
    expect(verify).toContain('create_rpc_service_role_only_execute')
    expect(verify).toContain('create_rpc_old_6arg_absent')
    expect(verify).toContain('data_counts_reported')
  })

  it('056 smoke does not forge service_role and expects 42501 in SQL Editor', () => {
    const smoke = read(
      'supabase/rollbacks/056_fix_class_schedule_create_rpc_ambiguous_columns_smoke.sql',
    )
    expect(smoke).toMatch(/rollback/i)
    expect(smoke).toContain('42501')
    expect(smoke).not.toMatch(/request\.jwt|set_config\(\s*'role'|set role service_role/i)
    expect(smoke).toContain('cannot set auth.role()')
  })
})

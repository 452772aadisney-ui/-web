import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

describe('055 repair migration static guarantees', () => {
  const sql = read('supabase/migrations/055_repair_class_schedule_partial_migration.sql')
  const preflight = read('supabase/queries/053_class_schedule_preflight.sql')
  const verify = read(
    'supabase/rollbacks/055_repair_class_schedule_partial_migration_verify.sql',
  )

  it('does not drop tables or use DROP FUNCTION ... CASCADE', () => {
    const withoutLineComments = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
    expect(withoutLineComments).not.toMatch(/drop\s+table/i)
    expect(withoutLineComments).not.toMatch(/\bdelete\s+from\s+public\.class_schedule_/i)
    const dropFunctionStmts = withoutLineComments
      .split(';')
      .filter((stmt) => /drop\s+function/i.test(stmt))
    expect(dropFunctionStmts.length).toBeGreaterThan(0)
    for (const stmt of dropFunctionStmts) {
      expect(stmt.toLowerCase()).not.toContain(' cascade')
    }
  })

  it('drops policies before uuid helper, then recreates no-arg policies', () => {
    const policyDrop = sql.indexOf(
      'drop policy if exists "class_schedule_days_select" on public.class_schedule_days',
    )
    const uuidDrop = sql.indexOf('drop function if exists public.is_kisotsu_profile(uuid)')
    const noargCreate = sql.indexOf('create or replace function public.is_kisotsu_profile()')
    const policyCreate = sql.lastIndexOf('create policy "class_schedule_days_select"')
    expect(policyDrop).toBeGreaterThanOrEqual(0)
    expect(uuidDrop).toBeGreaterThan(policyDrop)
    expect(noargCreate).toBeGreaterThan(uuidDrop)
    expect(policyCreate).toBeGreaterThan(noargCreate)
    expect(sql).toContain('public.is_kisotsu_profile()')
    expect(sql).not.toContain('is_kisotsu_profile(auth.uid())')
  })

  it('creates 7-arg RPC then drops old 6-arg RPC', () => {
    const seven = sql.indexOf('p_actor_id uuid')
    const dropSix = sql.lastIndexOf(
      'drop function if exists public.create_class_schedule_day_with_sessions(date, text, text, text, text, jsonb)',
    )
    expect(seven).toBeGreaterThanOrEqual(0)
    expect(dropSix).toBeGreaterThan(seven)
  })

  it('grants write RPCs only to service_role', () => {
    expect(sql).toMatch(
      /revoke all on function public\.create_class_schedule_day_with_sessions\(date, text, text, text, text, jsonb, uuid\) from authenticated/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.create_class_schedule_day_with_sessions\(date, text, text, text, text, jsonb, uuid\) to service_role/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.bump_class_schedule_notify_revision\(uuid, uuid\) to service_role/i,
    )
  })

  it('preflight detects overloads via oidvectortypes not bare uuid string', () => {
    expect(preflight).toContain('oidvectortypes(p.proargtypes)')
    expect(preflight).toContain("arg_types = 'uuid'")
    expect(preflight).not.toContain(
      "pg_get_function_identity_arguments(p.oid) = 'uuid'",
    )
  })

  it('verify covers old RPC absence and service_role-only execute', () => {
    expect(verify).toContain('create_rpc_old_6arg_absent')
    expect(verify).toContain('kisotsu_uuid_absent')
    expect(verify).toContain('create_rpc_service_role_only_execute')
    expect(verify).toContain('bump_rpc_service_role_only_execute')
  })
})

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '053_class_schedule.sql',
)

describe('053_class_schedule.sql apply order', () => {
  const sql = readFileSync(migrationPath, 'utf8')

  it('drops dependent policies before dropping is_kisotsu_profile(uuid)', () => {
    const policyDrop = sql.indexOf(
      'drop policy if exists "class_schedule_days_select" on public.class_schedule_days',
    )
    const uuidDrop = sql.indexOf('drop function if exists public.is_kisotsu_profile(uuid)')
    const noargCreate = sql.indexOf('create or replace function public.is_kisotsu_profile()')
    const policyRecreate = sql.lastIndexOf(
      'create policy "class_schedule_days_select"',
    )

    expect(policyDrop).toBeGreaterThanOrEqual(0)
    expect(uuidDrop).toBeGreaterThan(policyDrop)
    expect(noargCreate).toBeGreaterThan(uuidDrop)
    expect(policyRecreate).toBeGreaterThan(noargCreate)
  })

  it('recreates SELECT policies with no-arg is_kisotsu_profile()', () => {
    expect(sql).toContain('public.is_admin() or public.is_kisotsu_profile()')
    expect(sql).not.toContain('is_kisotsu_profile(auth.uid())')
    expect(sql).not.toMatch(/drop function if exists public\.is_kisotsu_profile\(uuid\)\s+cascade/i)
  })

  it('does not drop class_schedule tables during apply', () => {
    expect(sql).not.toMatch(/drop table\s+if\s+exists\s+public\.class_schedule_/i)
  })
})

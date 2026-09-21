import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function readMigration(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
}

function lastFunctionBody(sql: string, name: string): string {
  const re = new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$;`,
    'gi',
  )
  const matches = [...sql.matchAll(re)]
  const last = matches[matches.length - 1]?.[0] ?? ''
  return last
}

describe('070 class course attendance integrity migration', () => {
  const sql = readMigration('070_class_course_attendance_integrity.sql')

  it('drops student assignments SELECT policy', () => {
    expect(sql).toMatch(
      /drop policy if exists "class_course_assignments_select_own"/i,
    )
  })

  it('adds attendance source and keeps session_id null distinct from manual', () => {
    expect(sql).toMatch(/add column if not exists source text/i)
    expect(sql).toMatch(/check \(source in \('session', 'manual'\)\)/i)
  })

  it('softens course_unit rebind only when no events for the session', () => {
    const body = lastFunctionBody(sql, 'tg_deny_session_course_unit_rebind')
    expect(body).toMatch(/e\.session_id = old\.id/)
    expect(body).not.toMatch(/immutable once set/)
  })

  it('record_class_course_attendance uses service_role + p_actor_id super check', () => {
    const body = lastFunctionBody(sql, 'record_class_course_attendance')
    expect(body).toMatch(/auth\.role\(\) is distinct from 'service_role'/)
    expect(body).toMatch(
      /where id = p_actor_id and role = 'admin' and is_super_admin = true/,
    )
    expect(body).not.toMatch(/is_super_admin\(\)/)
    expect(sql).toMatch(
      /grant execute on function public\.record_class_course_attendance\([\s\S]*?\)\s+to service_role/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.record_class_course_attendance\([\s\S]*?\)\s+from anon, authenticated/i,
    )
  })

  it('locks active assignment FOR UPDATE before insert and skips duplicate attended', () => {
    const body = lastFunctionBody(sql, 'record_class_course_attendance')
    expect(body).toMatch(/from public\.class_course_assignments a[\s\S]*for update/i)
    expect(body).toMatch(/already_attended/)
    expect(body).toMatch(/p_status = 'attended' and v_latest = 'attended'/)
  })

  it('remove attendee locks the same assignment row before delete', () => {
    const body = lastFunctionBody(sql, 'remove_class_schedule_session_attendee')
    expect(body).toMatch(/from public\.class_course_assignments a[\s\S]*for update/i)
    expect(body).toMatch(
      /where id = p_actor_id and role = 'admin' and is_super_admin = true/,
    )
    expect(body).not.toMatch(/is_super_admin\(\)/)
  })
})

describe('067–069 write RPCs stay on p_actor_id (not auth.uid is_super_admin)', () => {
  it.each([
    [
      '067_class_course_sessions.sql',
      'create_class_course_units_with_assignments',
    ],
    ['068_class_course_cancel_guards.sql', 'cancel_class_course_assignment'],
    ['069_class_schedule_course_atomic.sql', 'create_class_schedule_day_with_course_sessions'],
    ['069_class_schedule_course_atomic.sql', 'cancel_class_course_assignment'],
  ] as const)('%s %s checks profiles by p_actor_id', (file, fn) => {
    const body = lastFunctionBody(readMigration(file), fn)
    expect(body).toMatch(/auth\.role\(\) is distinct from 'service_role'/)
    expect(body).toMatch(/p_actor_id/)
    expect(body).toMatch(/is_super_admin = true/)
    expect(body).not.toMatch(/is_super_admin\(\)/)
  })
})

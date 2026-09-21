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
  return matches[matches.length - 1]?.[0] ?? ''
}

describe('071 attendance lineage migration', () => {
  const sql = readMigration('071_class_course_attendance_lineage.sql')

  it('adds attendance_lineage_id and backfills from session_id or event id', () => {
    expect(sql).toMatch(/add column if not exists attendance_lineage_id uuid/i)
    expect(sql).toMatch(
      /attendance_lineage_id = coalesce\(session_id, id\)/i,
    )
  })

  it('denies session delete when lineage latest is attended or absent', () => {
    const body = lastFunctionBody(sql, 'tg_deny_session_delete_with_attendance')
    expect(body).toMatch(/attendance_lineage_id = old\.id/)
    expect(body).toMatch(/attended', 'absent/)
    expect(sql).toMatch(
      /before delete on public\.class_schedule_sessions/i,
    )
  })

  it('attendee delete trigger scopes to session lineage only', () => {
    const body = lastFunctionBody(sql, 'tg_deny_session_attendee_delete_with_record')
    expect(body).toMatch(/attendance_lineage_id = old\.session_id/)
  })

  it('record RPC uses lineage latest and errors on other-lineage attended', () => {
    const body = lastFunctionBody(sql, 'record_class_course_attendance')
    expect(body).toMatch(/p_attendance_lineage_id/)
    expect(body).toMatch(/already_attended_same_lineage/)
    expect(body).toMatch(/effective attendance already exists on another lineage/)
    expect(body).toMatch(/auth\.role\(\) is distinct from 'service_role'/)
    expect(body).not.toMatch(/is_super_admin\(\)/)
  })

  it('drops 6-arg record RPC and grants 7-arg to service_role only', () => {
    expect(sql).toMatch(
      /drop function if exists public\.record_class_course_attendance\(\s*uuid, uuid, text, date, uuid, uuid\s*\)/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.record_class_course_attendance\(\s*uuid, uuid, text, date, uuid, uuid, uuid\s*\)\s+to service_role/i,
    )
  })

  it('cancel checks any lineage latest attended', () => {
    const body = lastFunctionBody(sql, 'cancel_class_course_assignment')
    expect(body).toMatch(/distinct on \(e\.attendance_lineage_id\)/)
    expect(body).toMatch(/latest\.status = 'attended'/)
  })
})

describe('071 final state check query', () => {
  it('requires 7-arg record RPC and rejects leftover 6-arg', () => {
    const q = readFileSync(
      join(process.cwd(), 'supabase', 'queries', '071_class_course_final_state_check.sql'),
      'utf8',
    )
    expect(q).toMatch(/record_class_course_attendance\(uuid,uuid,text,date,uuid,uuid,uuid\)/)
    expect(q).toMatch(/6-arg must be gone after 071/)
    expect(q).toMatch(/final_assignments_select_own_absent/)
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const sql = readFileSync(
  path.join(
    process.cwd(),
    'supabase/rollbacks/057_class_schedule_location_details_precheck.sql',
  ),
  'utf8',
)

describe('057 precheck SQL (pre/post column)', () => {
  it('is read-only and never statically references location_details as a column', () => {
    expect(sql).toMatch(/READ-ONLY/i)
    // No mutating statement keywords as SQL commands (allow none in file body).
    expect(sql).not.toMatch(/(^|\n)\s*(insert|update|delete|alter|drop|create)\s+/i)
    // Must not use d.location_details / csd.location_details (42703 pre-057).
    expect(sql).not.toMatch(/\b[a-z_]+\.location_details\b/i)
    expect(sql).toMatch(/to_jsonb\(d\)\s*->>\s*'location_details'/)
    expect(sql).toMatch(/information_schema\.columns/)
  })

  it('reports required metrics including ready_for_057', () => {
    for (const metric of [
      'location_details_column_present',
      'days_total',
      'sessions_total',
      'days_with_address',
      'days_with_map_url',
      'days_with_room_note',
      'days_backfill_candidates',
      'days_with_location_details_filled',
      'sessions_time_out_of_range',
      'sessions_off_five_minute_grid',
      'sessions_nonzero_seconds',
      'sessions_blank_subject',
      'sessions_subject_over_100',
      'sessions_subject_control_chars',
      'notify_revision_sum',
      'ready_for_057',
    ]) {
      expect(sql).toContain(`'${metric}'`)
    }
  })

  it('documents how filled=0 means column absent vs empty column', () => {
    expect(sql).toMatch(/column absent/i)
    expect(sql).toMatch(/location_details_column_present/)
  })
})

/** Pure helpers mirroring precheck predicates for scenario unit tests. */
function locationDetailsFromJson(row: Record<string, unknown>): string | null {
  const raw = row.location_details
  if (raw == null) return null
  const trimmed = String(raw).replace(/^\s+|\s+$/g, '')
  return trimmed || null
}

function backfillCandidate(row: Record<string, unknown>): boolean {
  const loc = locationDetailsFromJson(row)
  if (loc != null) return false
  const parts = [row.address, row.map_url, row.room_note].map((v) =>
    String(v ?? '').trim(),
  )
  return parts.some(Boolean)
}

describe('057 precheck location_details scenarios (logic)', () => {
  it('column absent: filled=0, legacy rows are backfill candidates', () => {
    const rows = [
      { address: 'A', map_url: null, room_note: null },
      { address: null, map_url: null, room_note: null },
    ]
    expect(rows.filter((r) => locationDetailsFromJson(r) != null)).toHaveLength(0)
    expect(rows.filter(backfillCandidate)).toHaveLength(1)
  })

  it('column present all null: same as backfill from legacy only', () => {
    const rows = [
      {
        location_details: null,
        address: 'A',
        map_url: 'https://x',
        room_note: null,
      },
      {
        location_details: null,
        address: null,
        map_url: null,
        room_note: null,
      },
    ]
    expect(rows.filter((r) => locationDetailsFromJson(r) != null)).toHaveLength(0)
    expect(rows.filter(backfillCandidate)).toHaveLength(1)
  })

  it('column present partially filled: skips already filled', () => {
    const rows = [
      {
        location_details: 'saved',
        address: 'A',
        map_url: null,
        room_note: null,
      },
      {
        location_details: null,
        address: 'B',
        map_url: null,
        room_note: null,
      },
    ]
    expect(rows.filter((r) => locationDetailsFromJson(r) != null)).toHaveLength(1)
    expect(rows.filter(backfillCandidate)).toHaveLength(1)
  })

  it('zero days: all counts stay zero', () => {
    const rows: Record<string, unknown>[] = []
    expect(rows.length).toBe(0)
    expect(rows.filter(backfillCandidate)).toHaveLength(0)
  })
})

describe('057 precheck time/subject predicates (logic)', () => {
  function parseHm(value: string): number {
    const [h, m, s] = value.split(':').map(Number)
    return h * 3600 + m * 60 + (s || 0)
  }

  function outOfRange(start: string, end: string): boolean {
    const s = parseHm(start)
    const e = parseHm(end)
    return s < 8 * 3600 || s >= 23 * 3600 || e <= 8 * 3600 || e > 23 * 3600 || e <= s
  }

  function offFive(start: string, end: string): boolean {
    return parseHm(start) % 300 !== 0 || parseHm(end) % 300 !== 0
  }

  function nonzeroSeconds(start: string, end: string): boolean {
    return start.split(':').length > 2 && Number(start.split(':')[2]) !== 0
      || (end.split(':').length > 2 && Number(end.split(':')[2]) !== 0)
  }

  it('counts invalid times and subjects without exposing text', () => {
    const sessions = [
      { start: '07:55', end: '08:30', subject: 'ok' },
      { start: '10:03', end: '11:00', subject: 'ok' },
      { start: '10:00:01', end: '11:00:00', subject: 'ok' },
      { start: '10:00', end: '11:00', subject: '   ' },
      { start: '10:00', end: '11:00', subject: 'a'.repeat(101) },
      { start: '10:00', end: '11:00', subject: '英\u0001語' },
      { start: '10:00', end: '11:00', subject: '英語' },
    ]
    expect(sessions.filter((s) => outOfRange(s.start, s.end))).toHaveLength(1)
    expect(sessions.filter((s) => offFive(s.start, s.end))).toHaveLength(2)
    expect(sessions.filter((s) => nonzeroSeconds(s.start, s.end))).toHaveLength(1)
    expect(sessions.filter((s) => s.subject.trim().length === 0)).toHaveLength(1)
    expect(sessions.filter((s) => s.subject.trim().length > 100)).toHaveLength(1)
    expect(sessions.filter((s) => /[\u0000-\u001F\u007F]/.test(s.subject))).toHaveLength(
      1,
    )
  })
})

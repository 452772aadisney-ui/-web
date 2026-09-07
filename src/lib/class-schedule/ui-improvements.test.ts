import { describe, expect, it } from 'vitest'
import {
  isAllowedClassScheduleTimePair,
  isValidClassScheduleStartTime,
  isValidClassScheduleEndTime,
  listClassScheduleEndTimeOptions,
  listClassScheduleStartTimeOptions,
} from '@/lib/class-schedule/time-options'
import {
  normalizeSubject,
  parseSessionDraft,
  parseDayFields,
} from '@/lib/class-schedule/validation'
import {
  splitLocationDetailsSegments,
  resolveLocationDetailsText,
} from '@/lib/class-schedule/location-details'
import { classScheduleDayFieldsChanged } from '@/lib/class-schedule/notify-change'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('free-text subject', () => {
  it('accepts custom subjects and rejects blank / control chars / overlength', () => {
    expect(normalizeSubject('小論文演習').ok).toBe(true)
    expect(normalizeSubject('  ').ok).toBe(false)
    expect(normalizeSubject('a'.repeat(100)).ok).toBe(true)
    expect(normalizeSubject('a'.repeat(101)).ok).toBe(false)
    expect(normalizeSubject('英\u0001語').ok).toBe(false)
    expect(
      parseSessionDraft({
        start_time: '10:00',
        end_time: '11:00',
        subject: 'カスタム科目',
      }).ok,
    ).toBe(true)
  })
})

describe('location details', () => {
  it('parses optional location details with newlines', () => {
    const result = parseDayFields({
      schedule_date: '2026-09-10',
      venue_name: '会場',
      location_details: '東京都\nhttps://maps.example.com/a',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.day.location_details).toContain('https://')
  })

  it('falls back to legacy fields without empty lines', () => {
    expect(
      resolveLocationDetailsText({
        location_details: null,
        address: '住所',
        map_url: null,
        room_note: '3F',
      }),
    ).toBe('住所\n3F')
  })

  it('linkifies only https URLs', () => {
    const segments = splitLocationDetailsSegments(
      '案内 https://maps.example.com/x と javascript:alert(1) と data:text/html,hi',
    )
    const links = segments.filter((s) => s.type === 'link')
    expect(links).toHaveLength(1)
    if (links[0]?.type === 'link') {
      expect(links[0].href.startsWith('https://')).toBe(true)
    }
    expect(segments.some((s) => s.type === 'text' && s.value.includes('javascript:'))).toBe(
      true,
    )
  })

  it('does not notify on identical location_details', () => {
    expect(
      classScheduleDayFieldsChanged(
        {
          schedule_date: '2026-09-10',
          venue_name: '会場',
          location_details: 'A\nB',
        },
        {
          schedule_date: '2026-09-10',
          venue_name: '会場',
          location_details: 'A\nB',
        },
      ),
    ).toBe(false)
    expect(
      classScheduleDayFieldsChanged(
        {
          schedule_date: '2026-09-10',
          venue_name: '会場',
          location_details: 'A',
        },
        {
          schedule_date: '2026-09-10',
          venue_name: '会場',
          location_details: 'B',
        },
      ),
    ).toBe(true)
  })
})

describe('time grid', () => {
  it('allows 08:00 start through 22:55, end through 23:00', () => {
    expect(isValidClassScheduleStartTime('08:00')).toBe(true)
    expect(isValidClassScheduleStartTime('22:55')).toBe(true)
    expect(isValidClassScheduleStartTime('23:00')).toBe(false)
    expect(isValidClassScheduleEndTime('23:00')).toBe(true)
    expect(isAllowedClassScheduleTimePair({ start: '22:55', end: '23:00' })).toBe(
      true,
    )
  })

  it('rejects non-5-minute and end<=start', () => {
    expect(isValidClassScheduleStartTime('10:03')).toBe(false)
    expect(isAllowedClassScheduleTimePair({ start: '10:00', end: '10:00' })).toBe(
      false,
    )
  })

  it('preserves off-grid originals when unchanged (UI safety net; DB forbids new)', () => {
    expect(
      isAllowedClassScheduleTimePair({
        start: '10:03',
        end: '11:07',
        originalStart: '10:03',
        originalEnd: '11:07',
      }),
    ).toBe(true)
    expect(
      parseSessionDraft({
        start_time: '10:03',
        end_time: '11:07',
        subject: '英語',
        originalStart: '10:03',
        originalEnd: '11:07',
      }).ok,
    ).toBe(true)
  })

  it('lists end options after start only', () => {
    const ends = listClassScheduleEndTimeOptions('22:50')
    expect(ends[0]).toBe('22:55')
    expect(ends.at(-1)).toBe('23:00')
    expect(listClassScheduleStartTimeOptions()[0]).toBe('08:00')
  })
})

describe('057 migration static (dual RPC bridge)', () => {
  const sql = readFileSync(
    path.join(
      process.cwd(),
      'supabase/migrations/057_class_schedule_location_details.sql',
    ),
    'utf8',
  )

  it('adds location_details, keeps 7-arg, adds 5-arg, both service_role', () => {
    expect(sql).toMatch(/add column if not exists location_details/i)
    expect(sql).toMatch(/p_location_details text/)
    expect(sql).toMatch(
      /create or replace function public\.create_class_schedule_day_with_sessions\(\s*p_schedule_date date,\s*p_venue_name text,\s*p_address text,/i,
    )
    expect(sql).toMatch(
      /create or replace function public\.create_class_schedule_day_with_sessions\(\s*p_schedule_date date,\s*p_venue_name text,\s*p_location_details text,/i,
    )
    expect(sql).not.toMatch(
      /drop function if exists public\.create_class_schedule_day_with_sessions\(date, text, text, text, text, jsonb, uuid\)/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.create_class_schedule_day_with_sessions\(date, text, text, jsonb, uuid\) to service_role/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.create_class_schedule_day_with_sessions\(date, text, text, text, text, jsonb, uuid\) to service_role/i,
    )
    expect(sql).toMatch(/class_schedule_sessions_time_grid/)
    expect(sql).toMatch(/class_schedule_sessions_subject_valid/)
    expect(sql).toMatch(/057 abort: class_schedule_sessions has/)
    expect(sql).not.toMatch(/drop table/i)
    expect(sql).not.toMatch(/notify_revision\s*=\s*notify_revision\s*\+\s*1/)
  })

  it('7-arg compat writes location_details via concat_ws', () => {
    expect(sql).toMatch(/concat_ws\(E'\\n', v_address, v_map, v_room\)/)
  })
})

describe('058 cleanup static', () => {
  const sql = readFileSync(
    path.join(
      process.cwd(),
      'supabase/migrations/058_drop_legacy_class_schedule_create_rpc.sql',
    ),
    'utf8',
  )

  it('drops only the 7-arg overload after new app verification', () => {
    expect(sql).toMatch(
      /drop function if exists public\.create_class_schedule_day_with_sessions\(\s*date, text, text, text, text, jsonb, uuid\s*\)/i,
    )
    expect(sql).toMatch(/APPLY ONLY AFTER/i)
    expect(sql).toMatch(
      /grant execute on function public\.create_class_schedule_day_with_sessions\(date, text, text, jsonb, uuid\) to service_role/i,
    )
  })
})

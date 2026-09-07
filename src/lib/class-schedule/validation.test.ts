import { describe, expect, it } from 'vitest'
import {
  normalizeLocationDetails,
  normalizeSubject,
  parseDayFields,
  parseSessionDraft,
  validateSessionTimes,
} from '@/lib/class-schedule/validation'

describe('normalizeLocationDetails', () => {
  it('allows empty as null and keeps newlines', () => {
    expect(normalizeLocationDetails('')).toEqual({ ok: true, value: null })
    expect(normalizeLocationDetails('   ')).toEqual({ ok: true, value: null })
    expect(normalizeLocationDetails('  住所\nhttps://maps.example.com  ')).toEqual({
      ok: true,
      value: '住所\nhttps://maps.example.com',
    })
  })
})

describe('validateSessionTimes', () => {
  it('rejects end before or equal start', () => {
    expect(validateSessionTimes('10:00', '09:00').ok).toBe(false)
    expect(validateSessionTimes('10:00', '10:00').ok).toBe(false)
  })

  it('accepts valid range on 5-minute grid', () => {
    expect(validateSessionTimes('09:00', '10:30')).toEqual({
      ok: true,
      start: '09:00',
      end: '10:30',
    })
  })

  it('rejects off-grid times unless matching originals', () => {
    expect(validateSessionTimes('09:03', '10:00').ok).toBe(false)
    expect(
      validateSessionTimes('09:03', '10:07', {
        originalStart: '09:03',
        originalEnd: '10:07',
      }).ok,
    ).toBe(true)
  })
})

describe('parseSessionDraft', () => {
  it('accepts free-text subjects', () => {
    const result = parseSessionDraft({
      start_time: '09:00',
      end_time: '10:00',
      subject: 'カスタム科目',
      note: '  メモ  ',
    })
    expect(result).toEqual({
      ok: true,
      session: {
        start_time: '09:00',
        end_time: '10:00',
        subject: 'カスタム科目',
        note: 'メモ',
      },
    })
  })

  it('rejects blank or whitespace-only subject', () => {
    expect(
      parseSessionDraft({
        start_time: '09:00',
        end_time: '10:00',
        subject: '   ',
      }).ok,
    ).toBe(false)
    expect(normalizeSubject('').ok).toBe(false)
  })
})

describe('parseDayFields', () => {
  it('requires venue and valid date', () => {
    expect(
      parseDayFields({ schedule_date: '2026-13-01', venue_name: '会場' }).ok,
    ).toBe(false)
    expect(parseDayFields({ schedule_date: '2026-09-07', venue_name: '  ' }).ok).toBe(
      false,
    )
  })

  it('parses valid day with location_details', () => {
    expect(
      parseDayFields({
        schedule_date: '2026-09-07',
        venue_name: '本館',
        location_details: '東京都\n会議室A',
      }),
    ).toEqual({
      ok: true,
      day: {
        schedule_date: '2026-09-07',
        venue_name: '本館',
        location_details: '東京都\n会議室A',
      },
    })
  })
})

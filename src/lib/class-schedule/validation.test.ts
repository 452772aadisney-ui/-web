import { describe, expect, it } from 'vitest'
import {
  isExamSubject,
  normalizeMapUrl,
  parseDayFields,
  parseSessionDraft,
  validateSessionTimes,
} from '@/lib/class-schedule/validation'

describe('normalizeMapUrl', () => {
  it('allows empty as null', () => {
    expect(normalizeMapUrl('')).toEqual({ ok: true, value: null })
    expect(normalizeMapUrl('   ')).toEqual({ ok: true, value: null })
  })

  it('requires https', () => {
    expect(normalizeMapUrl('http://example.com').ok).toBe(false)
    expect(normalizeMapUrl('ftp://example.com').ok).toBe(false)
    expect(normalizeMapUrl('https://maps.example.com/foo')).toEqual({
      ok: true,
      value: 'https://maps.example.com/foo',
    })
  })
})

describe('validateSessionTimes', () => {
  it('rejects end before or equal start', () => {
    expect(validateSessionTimes('10:00', '09:00').ok).toBe(false)
    expect(validateSessionTimes('10:00', '10:00').ok).toBe(false)
  })

  it('accepts valid range', () => {
    expect(validateSessionTimes('09:00', '10:30')).toEqual({
      ok: true,
      start: '09:00',
      end: '10:30',
    })
  })
})

describe('parseSessionDraft', () => {
  it('rejects unknown subject', () => {
    expect(
      parseSessionDraft({
        start_time: '09:00',
        end_time: '10:00',
        subject: '存在しない科目',
      }).ok,
    ).toBe(false)
  })

  it('accepts EXAM_SUBJECTS entry', () => {
    const result = parseSessionDraft({
      start_time: '09:00',
      end_time: '10:00',
      subject: '英語',
      note: '  メモ  ',
    })
    expect(result).toEqual({
      ok: true,
      session: {
        start_time: '09:00',
        end_time: '10:00',
        subject: '英語',
        note: 'メモ',
      },
    })
  })
})

describe('parseDayFields', () => {
  it('requires venue and valid date', () => {
    expect(
      parseDayFields({ schedule_date: '2026-13-01', venue_name: '会場' }).ok,
    ).toBe(false)
    expect(parseDayFields({ schedule_date: '2026-09-07', venue_name: '  ' }).ok).toBe(false)
  })

  it('parses valid day', () => {
    expect(
      parseDayFields({
        schedule_date: '2026-09-07',
        venue_name: '本館',
        address: '東京都',
        map_url: 'https://maps.example.com',
        room_note: '3F',
      }),
    ).toEqual({
      ok: true,
      day: {
        schedule_date: '2026-09-07',
        venue_name: '本館',
        address: '東京都',
        map_url: 'https://maps.example.com',
        room_note: '3F',
      },
    })
  })
})

describe('isExamSubject', () => {
  it('matches known subjects', () => {
    expect(isExamSubject('数学IA')).toBe(true)
    expect(isExamSubject('不明')).toBe(false)
  })
})

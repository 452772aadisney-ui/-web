import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getJstDateKey,
  isValidDateKey,
  shiftDateKey,
  toLocalDateKey,
} from '@/lib/study/dates'

describe('study date keys', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('validates YYYY-MM-DD keys', () => {
    expect(isValidDateKey('2024-01-15')).toBe(true)
    expect(isValidDateKey('2024-1-15')).toBe(false)
    expect(isValidDateKey(undefined)).toBe(false)
  })

  it('shifts YYYY-MM-DD with UTC arithmetic (not local midnight DST)', () => {
    expect(shiftDateKey('2024-03-10', 1)).toBe('2024-03-11')
    expect(shiftDateKey('2024-03-10', -1)).toBe('2024-03-09')
    expect(shiftDateKey('2024-02-28', 1)).toBe('2024-02-29')
    expect(shiftDateKey('2023-02-28', 1)).toBe('2023-03-01')
    expect(shiftDateKey('2024-12-31', 1)).toBe('2025-01-01')
  })

  it('round-trips calendar parts via local Date construction (extreme local TZ safe)', () => {
    // Parsing Y-M-D as local components (not Date.parse ISO UTC) keeps the key stable.
    const key = '2024-06-15'
    const [y, m, d] = key.split('-').map(Number)
    const local = new Date(y!, m! - 1, d!)
    expect(toLocalDateKey(local)).toBe(key)
  })

  it('getJstDateKey uses Asia/Tokyo regardless of system instant', () => {
    // 2024-01-01 10:00 UTC = 2024-01-01 19:00 JST
    vi.setSystemTime(new Date('2024-01-01T10:00:00.000Z'))
    expect(getJstDateKey()).toBe('2024-01-01')

    // 2024-01-01 15:30 UTC = 2024-01-02 00:30 JST
    vi.setSystemTime(new Date('2024-01-01T15:30:00.000Z'))
    expect(getJstDateKey()).toBe('2024-01-02')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveNewKarteSessionDate } from '@/lib/coaching/karte-session-date'

describe('resolveNewKarteSessionDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses JST today when UTC is still the previous calendar day', () => {
    // 2026-09-05 15:30 UTC = 2026-09-06 00:30 JST
    vi.setSystemTime(new Date('2026-09-05T15:30:00.000Z'))
    expect(resolveNewKarteSessionDate()).toBe('2026-09-06')
  })

  it('uses JST today during a normal daytime instant', () => {
    // 2026-09-06 03:00 UTC = 2026-09-06 12:00 JST
    vi.setSystemTime(new Date('2026-09-06T03:00:00.000Z'))
    expect(resolveNewKarteSessionDate()).toBe('2026-09-06')
  })

  it('does not overwrite a valid saved or draft session date', () => {
    vi.setSystemTime(new Date('2026-09-05T15:30:00.000Z'))
    expect(resolveNewKarteSessionDate({ savedOrDraftDate: '2026-09-01' })).toBe('2026-09-01')
  })

  it('ignores invalid saved dates and falls back to JST today', () => {
    vi.setSystemTime(new Date('2026-09-05T15:30:00.000Z'))
    expect(resolveNewKarteSessionDate({ savedOrDraftDate: '2026-9-1' })).toBe('2026-09-06')
    expect(resolveNewKarteSessionDate({ savedOrDraftDate: '' })).toBe('2026-09-06')
    expect(resolveNewKarteSessionDate({ savedOrDraftDate: null })).toBe('2026-09-06')
  })
})

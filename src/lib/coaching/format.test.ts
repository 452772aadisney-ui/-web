import { describe, expect, it } from 'vitest'
import { formatCoachingBookingActionTarget } from '@/lib/coaching/format'

describe('formatCoachingBookingActionTarget', () => {
  it('builds a compact aria/confirm target from slot date and start time', () => {
    expect(
      formatCoachingBookingActionTarget(
        '山田',
        '2026-09-06',
        '20:00:00',
        '2026-09-06T11:00:00.000Z',
      ),
    ).toBe('山田さんの9月6日20時の予約')
  })

  it('falls back to startsAt in Asia/Tokyo when slot fields are missing', () => {
    expect(
      formatCoachingBookingActionTarget(
        '佐藤',
        null,
        null,
        '2026-09-06T11:00:00.000Z',
      ),
    ).toBe('佐藤さんの9月6日20時の予約')
  })
})

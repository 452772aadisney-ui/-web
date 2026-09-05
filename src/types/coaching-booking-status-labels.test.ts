import { describe, expect, it } from 'vitest'
import { COACHING_BOOKING_STATUS_LABELS } from '@/types/coaching'

describe('COACHING_BOOKING_STATUS_LABELS', () => {
  it('uses the updated Japanese labels', () => {
    expect(COACHING_BOOKING_STATUS_LABELS.scheduled).toBe('予約済み・実施前')
    expect(COACHING_BOOKING_STATUS_LABELS.completed).toBe('実施済み')
    expect(COACHING_BOOKING_STATUS_LABELS.cancelled).toBe('キャンセル')
    expect(COACHING_BOOKING_STATUS_LABELS.no_show).toBe('無断欠席')
  })
})

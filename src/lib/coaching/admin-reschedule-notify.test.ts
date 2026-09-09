import { describe, expect, it } from 'vitest'
import {
  ADMIN_RESCHEDULE_PUSH_BODY,
  adminRescheduleEmailBody,
  adminRescheduleIdempotencyKey,
} from '@/lib/coaching/coaching-reminder-email'

describe('admin coaching reschedule notify helpers', () => {
  it('uses a fixed Push body without venue or free text', () => {
    expect(ADMIN_RESCHEDULE_PUSH_BODY).toBe(
      'コーチングの予約が変更されました。内容を確認してください。',
    )
  })

  it('includes coach and datetime in the email fallback body', () => {
    expect(adminRescheduleEmailBody('山田', '3月10日 10:00〜10:50')).toContain('山田')
    expect(adminRescheduleEmailBody('山田', '3月10日 10:00〜10:50')).toContain(
      '3月10日 10:00〜10:50',
    )
  })

  it('keys notify by persisted change revision, not a time pair', () => {
    const firstAb = adminRescheduleIdempotencyKey('b1', '2026-03-10T01:00:00.000Z')
    const retrySameOp = adminRescheduleIdempotencyKey('b1', '2026-03-10T01:00:00.000Z')
    // A→B then later A→B again after B→A: each successful DB write has a new booked_at.
    const laterAbAgain = adminRescheduleIdempotencyKey('b1', '2026-03-12T04:00:00.000Z')
    // Same datetime, different coach/slot still gets a distinct revision on write.
    const sameTimeOtherSlot = adminRescheduleIdempotencyKey('b1', '2026-03-10T01:00:01.000Z')

    expect(firstAb).toBe(retrySameOp)
    expect(laterAbAgain).not.toBe(firstAb)
    expect(sameTimeOtherSlot).not.toBe(firstAb)
  })
})

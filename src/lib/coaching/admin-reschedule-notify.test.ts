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

  it('dedupes the same before→after change and differs on later re-changes', () => {
    const first = adminRescheduleIdempotencyKey('b1', '2026-03-10T01:00:00.000Z', '2026-03-11T01:00:00.000Z')
    const retry = adminRescheduleIdempotencyKey('b1', '2026-03-10T01:00:00.000Z', '2026-03-11T01:00:00.000Z')
    const later = adminRescheduleIdempotencyKey('b1', '2026-03-11T01:00:00.000Z', '2026-03-12T01:00:00.000Z')
    expect(first).toBe(retry)
    expect(later).not.toBe(first)
  })
})

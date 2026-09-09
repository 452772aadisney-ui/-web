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

  it('keys notify by persisted schedule_revision UUID', () => {
    const first = adminRescheduleIdempotencyKey('b1', '11111111-1111-1111-1111-111111111111')
    const retry = adminRescheduleIdempotencyKey('b1', '11111111-1111-1111-1111-111111111111')
    const later = adminRescheduleIdempotencyKey('b1', '22222222-2222-2222-2222-222222222222')
    expect(first).toBe(retry)
    expect(later).not.toBe(first)
  })
})

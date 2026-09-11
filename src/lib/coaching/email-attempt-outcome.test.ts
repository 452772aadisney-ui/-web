import { describe, expect, it } from 'vitest'
import {
  RESEND_IDEMPOTENCY_RETENTION_MS,
  acceptanceToAttemptStatus,
  canSafelyRetryUnknownWithResendIdempotency,
  classifyEmailSendAcceptance,
} from '@/lib/coaching/email-attempt-outcome'
import { coachingBookingCalendarEventId } from '@/lib/google-calendar/stable-event-id'

describe('email attempt outcome', () => {
  it('treats 2xx as accepted and network as unknown', () => {
    expect(classifyEmailSendAcceptance({ ok: true, httpStatus: 200 })).toBe('accepted')
    expect(
      classifyEmailSendAcceptance({ ok: false, errorClass: 'network', httpStatus: null }),
    ).toBe('unknown')
    expect(
      classifyEmailSendAcceptance({
        ok: false,
        errorClass: 'provider_error',
        httpStatus: 400,
      }),
    ).toBe('not_accepted')
  })

  it('maps acceptance to attempt status without inventing unknown as failed', () => {
    expect(acceptanceToAttemptStatus('accepted')).toBe('sent')
    expect(acceptanceToAttemptStatus('not_accepted')).toBe('failed')
    expect(acceptanceToAttemptStatus('unknown')).toBe('unknown')
  })

  it('allows Resend-safe unknown retry only inside 24h window', () => {
    const t0 = Date.parse('2026-09-10T00:00:00.000Z')
    expect(
      canSafelyRetryUnknownWithResendIdempotency({
        firstAttemptStartedAtMs: t0,
        nowMs: t0 + RESEND_IDEMPOTENCY_RETENTION_MS - 1,
      }),
    ).toBe(true)
    expect(
      canSafelyRetryUnknownWithResendIdempotency({
        firstAttemptStartedAtMs: t0,
        nowMs: t0 + RESEND_IDEMPOTENCY_RETENTION_MS,
      }),
    ).toBe(false)
  })

  it('treats payload-mismatch 409 as not_accepted (no new-key retry)', () => {
    expect(
      classifyEmailSendAcceptance({
        ok: false,
        errorClass: 'idempotency_payload_mismatch',
        httpStatus: 409,
      }),
    ).toBe('not_accepted')
    expect(
      classifyEmailSendAcceptance({
        ok: false,
        errorClass: 'idempotency_concurrent',
        httpStatus: 409,
      }),
    ).toBe('unknown')
  })
})

describe('classifyResendIdempotencyConflict', () => {
  it('distinguishes Resend 409 names', async () => {
    const { classifyResendIdempotencyConflict } = await import('@/lib/email/send')
    expect(
      classifyResendIdempotencyConflict(
        JSON.stringify({ name: 'invalid_idempotent_request', message: 'x' }),
      ),
    ).toBe('idempotency_payload_mismatch')
    expect(
      classifyResendIdempotencyConflict(
        JSON.stringify({ name: 'concurrent_idempotent_requests', message: 'x' }),
      ),
    ).toBe('idempotency_concurrent')
  })
})

describe('coachingBookingCalendarEventId', () => {
  it('produces base32hex-safe stable ids from booking UUID', () => {
    const id = coachingBookingCalendarEventId('11111111-1111-1111-1111-111111111111')
    expect(id).toBe('cbk' + '1'.repeat(32))
    expect(id).toMatch(/^[0-9a-v]+$/)
    expect(id.length).toBeGreaterThanOrEqual(5)
  })
})

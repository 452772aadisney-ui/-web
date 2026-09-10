/**
 * Classify email provider outcomes for retry safety.
 *
 * - not_accepted: provider (or local gate) definitely did not accept the message
 * - accepted: provider returned success (2xx)
 * - unknown: network/timeout/disconnect — may or may not have been accepted
 */

export type EmailAcceptance = 'not_accepted' | 'accepted' | 'unknown'

export type EmailAttemptOutcomeStatus = 'sent' | 'failed' | 'unknown'

/** Resend keeps Idempotency-Key responses for 24 hours (official docs). */
export const RESEND_IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000

export function classifyEmailSendAcceptance(params: {
  ok: boolean
  errorClass?: string | null
  httpStatus?: number | null
  skipped?: boolean
}): EmailAcceptance {
  if (params.ok) return 'accepted'

  // Local gates / definite non-accept before or from provider
  if (
    params.skipped ||
    params.errorClass === 'empty_recipient' ||
    params.errorClass === 'deadline' ||
    params.errorClass === 'email_not_configured'
  ) {
    return 'not_accepted'
  }

  // Network / no HTTP status → unknown whether Resend accepted
  if (params.errorClass === 'network' || params.httpStatus == null) {
    return 'unknown'
  }

  // Explicit HTTP error from Resend → not accepted (safe to retry with same key)
  if (params.httpStatus >= 400) return 'not_accepted'

  return 'unknown'
}

export function acceptanceToAttemptStatus(
  acceptance: EmailAcceptance,
): EmailAttemptOutcomeStatus {
  if (acceptance === 'accepted') return 'sent'
  if (acceptance === 'not_accepted') return 'failed'
  return 'unknown'
}

/**
 * After Resend's 24h idempotency window, retrying an `unknown` outcome can
 * create a duplicate if the first request was actually accepted.
 */
export function canSafelyRetryUnknownWithResendIdempotency(params: {
  firstAttemptStartedAtMs: number
  nowMs: number
}): boolean {
  return params.nowMs - params.firstAttemptStartedAtMs < RESEND_IDEMPOTENCY_RETENTION_MS
}

/**
 * Shared Resend send pacing for study-reminder and admin notification tests.
 * Keeps request starts spaced so bursts stay under team rate limits.
 *
 * Resend documents a default of 5 requests/second per team (shared across API keys).
 * We target ~3.3 starts/sec (300ms) to leave headroom for other app traffic.
 *
 * Limitation: this queue is process-local (one Vercel Function instance). It does not
 * coordinate across separate serverless invocations; concurrent Crons/admin actions on
 * different instances can still share the team-wide Resend limit.
 */

/** Minimum time between starting successive Resend HTTP requests. */
export const RESEND_SEND_MIN_INTERVAL_MS = 300

/**
 * Study-reminder / admin-test email sends must go through {@link withResendSendPace}.
 * Student-level Push/DB work may still run in parallel.
 */
export const STUDY_REMINDER_EMAIL_MAX_IN_FLIGHT = 1

let chain: Promise<unknown> = Promise.resolve()
let lastStartMs = 0

/** Test-only reset. */
export function resetResendSendPaceForTests(nowMs = 0): void {
  chain = Promise.resolve()
  // Allow the next send to start immediately at nowMs.
  lastStartMs = nowMs - RESEND_SEND_MIN_INTERVAL_MS
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Serialize Resend sends and enforce {@link RESEND_SEND_MIN_INTERVAL_MS}
 * between request starts. Failures do not block later waiters.
 */
export function withResendSendPace<T>(
  fn: () => Promise<T>,
  options?: { nowMs?: () => number; sleep?: (ms: number) => Promise<void> },
): Promise<T> {
  const nowMs = options?.nowMs ?? Date.now
  const sleep = options?.sleep ?? sleepMs

  const run = chain.then(async () => {
    const elapsed = nowMs() - lastStartMs
    const wait = Math.max(0, RESEND_SEND_MIN_INTERVAL_MS - elapsed)
    if (wait > 0) {
      await sleep(wait)
    }
    lastStartMs = nowMs()
    return fn()
  }) as Promise<T>

  chain = run.then(
    () => undefined,
    () => undefined,
  )

  return run
}

/** Safe provider error class for logs / delivery.error_code (no Retry-After). */
export function classifyResendHttpStatus(
  status: number | null | undefined,
): 'rate_limited' | 'provider_error' {
  if (status === 429) return 'rate_limited'
  return 'provider_error'
}

import { createAdminClient } from '@/lib/supabase/admin'
import {
  COACHING_REMINDER_STUDENT_CONCURRENCY,
  coachingReminderSoftDeadlineMs,
  resolveEffectiveCoachingReminderMode,
  type CoachingReminderDeliveryMode,
} from '@/lib/coaching/coaching-reminder-mode'
import {
  sessionPreviousDayIdempotencyKey,
  sessionPreviousDayPushBody,
} from '@/lib/coaching/coaching-reminder-email'
import {
  loadSessionReminderCandidates,
  sessionBookingStillValid,
  type SessionReminderCandidate,
} from '@/lib/coaching/coaching-reminder-candidates'
import {
  processCoachingReminderNewPath,
  type CoachingReminderNewPathOutcome,
} from '@/lib/coaching/coaching-reminder-new-path'
import { formatJstHm } from '@/lib/coaching/coaching-reminder-jst'
import { evaluateCoachingAdminDryRunReport } from '@/lib/coaching/coaching-reminder-dry-run'

export type SessionReminderRunSummary = {
  ok: boolean
  mode: CoachingReminderDeliveryMode
  tomorrowKey: string
  candidates: number
  pushSucceeded: number
  emailFallbackSucceeded: number
  preferenceDisabled: number
  cancelledOrChanged: number
  cannotDeliver: number
  failed: number
  unprocessed: number
  alreadyCompleted: number
  nonProductionSkip: number
  /** legacy/dry-run: no prior day-before delivery existed — counted as skipped. */
  legacySkipped: number
  timedOut: boolean
  durationMs: number
  wouldUsePush?: number
  wouldFallbackEmail?: number
  forcedLegacyReason?: 'allowlist_empty' | 'allowlist_invalid' | null
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    for (;;) {
      const current = nextIndex
      nextIndex += 1
      if (current >= items.length) return
      results[current] = await mapper(items[current]!)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )
  return results
}

function tally(
  summary: SessionReminderRunSummary,
  outcome: CoachingReminderNewPathOutcome,
) {
  switch (outcome) {
    case 'push_sent':
      summary.pushSucceeded += 1
      break
    case 'email_sent':
      summary.emailFallbackSucceeded += 1
      break
    case 'preference_disabled':
      summary.preferenceDisabled += 1
      break
    case 'already_completed':
      summary.alreadyCompleted += 1
      break
    case 'undeliverable':
      summary.cannotDeliver += 1
      break
    case 'non_production_skip':
      summary.nonProductionSkip += 1
      break
    case 'timed_out':
      summary.timedOut = true
      summary.unprocessed += 1
      summary.ok = false
      break
    case 'in_progress':
    case 'stale_pending':
    case 'email_failed':
    case 'failed':
      summary.failed += 1
      break
  }
}

/**
 * Day-before session reminder. No chat message (direct notification events).
 * legacy: no external send (no prior day-before path existed).
 */
export async function runCoachingSessionReminderJob(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Promise<
  { ok: true; summary: SessionReminderRunSummary } | { ok: false; error: 'build_failed' }
> {
  const startedAt = Date.now()
  const effective = resolveEffectiveCoachingReminderMode(env)
  const deadlineMs = coachingReminderSoftDeadlineMs(startedAt)

  const loaded = await loadSessionReminderCandidates()
  if (!loaded.ok) return { ok: false, error: 'build_failed' }

  const summary: SessionReminderRunSummary = {
    ok: true,
    mode: effective.mode,
    tomorrowKey: loaded.tomorrowKey,
    candidates: loaded.candidates.length,
    pushSucceeded: 0,
    emailFallbackSucceeded: 0,
    preferenceDisabled: 0,
    cancelledOrChanged: 0,
    cannotDeliver: 0,
    failed: 0,
    unprocessed: 0,
    alreadyCompleted: 0,
    nonProductionSkip: 0,
    legacySkipped: 0,
    timedOut: false,
    durationMs: 0,
    forcedLegacyReason: effective.forcedLegacyReason,
  }

  if (effective.mode === 'dry-run') {
    const evaluated = await evaluateCoachingAdminDryRunReport({ env })
    if (!evaluated.ok) return { ok: false, error: 'build_failed' }
    summary.wouldUsePush = evaluated.report.sessionPreviousDayCurrent.wouldUsePush
    summary.wouldFallbackEmail =
      evaluated.report.sessionPreviousDayCurrent.wouldFallbackEmail
    summary.preferenceDisabled =
      evaluated.report.sessionPreviousDayCurrent.preferenceDisabled
    summary.cannotDeliver = evaluated.report.sessionPreviousDayCurrent.cannotDeliver
    summary.failed = evaluated.report.sessionPreviousDayCurrent.failed
    summary.legacySkipped = loaded.candidates.length
    summary.durationMs = Date.now() - startedAt
    console.info('[coaching-session-reminder] dry-run', {
      candidates: summary.candidates,
      tomorrowKey: summary.tomorrowKey,
      wouldUsePush: summary.wouldUsePush,
      wouldFallbackEmail: summary.wouldFallbackEmail,
    })
    return { ok: true, summary }
  }

  if (effective.mode === 'legacy') {
    summary.legacySkipped = loaded.candidates.length
    summary.durationMs = Date.now() - startedAt
    return { ok: true, summary }
  }

  const admin = createAdminClient()
  if (!admin) {
    summary.ok = false
    summary.failed = loaded.candidates.length
    summary.durationMs = Date.now() - startedAt
    return { ok: true, summary }
  }

  const handleOne = async (candidate: SessionReminderCandidate) => {
    if (Date.now() >= deadlineMs) {
      summary.timedOut = true
      summary.unprocessed += 1
      summary.ok = false
      return
    }

    const useNewPath =
      effective.mode === 'all' ||
      (effective.mode === 'allowlist' &&
        effective.allowlist != null &&
        effective.allowlist.has(candidate.studentId.toLowerCase()))

    if (!useNewPath) {
      summary.legacySkipped += 1
      return
    }

    const valid = await sessionBookingStillValid(
      admin,
      candidate.bookingId,
      loaded.tomorrowKey,
      candidate.startsAt,
    )
    if (!valid.ok) {
      summary.failed += 1
      return
    }
    if (!valid.valid) {
      summary.cancelledOrChanged += 1
      return
    }

    const hm = formatJstHm(candidate.startsAt)
    const outcome = await processCoachingReminderNewPath({
      studentUserId: candidate.studentId,
      email: candidate.email,
      idempotencyKey: sessionPreviousDayIdempotencyKey(
        candidate.bookingId,
        candidate.startsAt,
      ),
      kind: 'session_previous_day',
      pushBody: sessionPreviousDayPushBody(hm),
      hm,
      tag: 'coaching-session-reminder',
      deadlineMs,
      env,
    })
    tally(summary, outcome)
  }

  await mapPool(loaded.candidates, COACHING_REMINDER_STUDENT_CONCURRENCY, handleOne)
  summary.durationMs = Date.now() - startedAt
  return { ok: true, summary }
}

export function toPublicSessionReminderSummary(
  summary: SessionReminderRunSummary,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ok: summary.ok,
    mode: summary.mode,
    tomorrowKey: summary.tomorrowKey,
    candidates: summary.candidates,
    pushSucceeded: summary.pushSucceeded,
    emailFallbackSucceeded: summary.emailFallbackSucceeded,
    preferenceDisabled: summary.preferenceDisabled,
    cancelledOrChanged: summary.cancelledOrChanged,
    cannotDeliver: summary.cannotDeliver,
    failed: summary.failed,
    unprocessed: summary.unprocessed,
    alreadyCompleted: summary.alreadyCompleted,
    nonProductionSkip: summary.nonProductionSkip,
    legacySkipped: summary.legacySkipped,
    timedOut: summary.timedOut,
    durationMs: summary.durationMs,
    forcedLegacyReason: summary.forcedLegacyReason ?? null,
  }
  if (summary.mode === 'dry-run') {
    base.wouldUsePush = summary.wouldUsePush ?? 0
    base.wouldFallbackEmail = summary.wouldFallbackEmail ?? 0
  }
  return base
}

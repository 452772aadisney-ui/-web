import { createAdminClient } from '@/lib/supabase/admin'
import {
  COACHING_REMINDER_STUDENT_CONCURRENCY,
  coachingReminderSoftDeadlineMs,
  resolveEffectiveCoachingReminderMode,
  type CoachingReminderDeliveryMode,
} from '@/lib/coaching/coaching-reminder-mode'
import {
  BOOKING_PROMPT_PUSH_BODY,
  bookingPromptIdempotencyKey,
} from '@/lib/coaching/coaching-reminder-email'
import {
  loadBookingPromptCandidates,
  studentStillUnbookedThisWeek,
  type BookingPromptCandidate,
} from '@/lib/coaching/coaching-reminder-candidates'
import {
  processCoachingReminderNewPath,
  type CoachingReminderNewPathOutcome,
} from '@/lib/coaching/coaching-reminder-new-path'
import { addDaysToDateKey } from '@/lib/coaching/coaching-reminder-jst'
import { evaluateCoachingAdminDryRunReport } from '@/lib/coaching/coaching-reminder-dry-run'

export type BookingPromptRunSummary = {
  ok: boolean
  mode: CoachingReminderDeliveryMode
  weekMondayKey: string
  candidates: number
  alreadyBooked: number
  chatCreated: number
  chatSkippedDuplicate: number
  pushSucceeded: number
  emailFallbackSucceeded: number
  preferenceDisabled: number
  cancelledOrChanged: number
  cannotDeliver: number
  failed: number
  unprocessed: number
  alreadyCompleted: number
  nonProductionSkip: number
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
  summary: BookingPromptRunSummary,
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

/** Shared by Cron and admin integration test. Never logs student ids.
 *
 * Week-scoped idempotency: one `coaching_booking_reminder` per student per JST week.
 * Admin real-path tests intentionally create the same kind of message; Cron then
 * counts `duplicate` for chat but still proceeds to Push-first with the Cron
 * idempotency key (event keys remain separate).
 */
export async function ensureBookingPromptChat(params: {
  admin: NonNullable<ReturnType<typeof createAdminClient>>
  studentId: string
  weekMondayKey: string
  weekEndExclusiveKey: string
  adminSenderId: string | null
}): Promise<'created' | 'duplicate' | 'failed'> {
  const { data: existing, error: existingError } = await params.admin
    .from('chat_messages')
    .select('id')
    .eq('student_id', params.studentId)
    .eq('message_kind', 'coaching_booking_reminder')
    .gte('created_at', `${params.weekMondayKey}T00:00:00+09:00`)
    .lt('created_at', `${params.weekEndExclusiveKey}T00:00:00+09:00`)
    .limit(1)

  if (existingError) return 'failed'
  if ((existing?.length ?? 0) > 0) return 'duplicate'
  if (!params.adminSenderId) return 'failed'

  const { error } = await params.admin.from('chat_messages').insert({
    student_id: params.studentId,
    sender_id: params.adminSenderId,
    body: '今週のコーチング予約が入っていません。マイページの「コーチング予約」から，早急に予約してください。今週が難しい場合は，必ず担当者に個別で相談してください。',
    message_kind: 'coaching_booking_reminder',
  })

  return error ? 'failed' : 'created'
}

async function resolveCronSenderAdminId(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
): Promise<string | null> {
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle<{ id: string }>()
  return data?.id ?? null
}

export async function runCoachingBookingPromptJob(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Promise<{ ok: true; summary: BookingPromptRunSummary } | { ok: false; error: 'build_failed' }> {
  const startedAt = Date.now()
  const effective = resolveEffectiveCoachingReminderMode(env)
  const deadlineMs = coachingReminderSoftDeadlineMs(startedAt)

  const loaded = await loadBookingPromptCandidates()
  if (!loaded.ok) return { ok: false, error: 'build_failed' }

  const weekEndExclusiveKey = addDaysToDateKey(loaded.weekMondayKey, 7)

  const summary: BookingPromptRunSummary = {
    ok: true,
    mode: effective.mode,
    weekMondayKey: loaded.weekMondayKey,
    candidates: loaded.candidates.length,
    alreadyBooked: loaded.bookedStudentCount,
    chatCreated: 0,
    chatSkippedDuplicate: 0,
    pushSucceeded: 0,
    emailFallbackSucceeded: 0,
    preferenceDisabled: 0,
    cancelledOrChanged: 0,
    cannotDeliver: 0,
    failed: 0,
    unprocessed: 0,
    alreadyCompleted: 0,
    nonProductionSkip: 0,
    timedOut: false,
    durationMs: 0,
    forcedLegacyReason: effective.forcedLegacyReason,
  }

  if (effective.mode === 'dry-run') {
    const evaluated = await evaluateCoachingAdminDryRunReport({ env })
    if (!evaluated.ok) return { ok: false, error: 'build_failed' }
    summary.wouldUsePush = evaluated.report.bookingPromptCurrent.wouldUsePush
    summary.wouldFallbackEmail =
      evaluated.report.bookingPromptCurrent.wouldFallbackEmail
    summary.preferenceDisabled =
      evaluated.report.bookingPromptCurrent.preferenceDisabled
    summary.cannotDeliver = evaluated.report.bookingPromptCurrent.cannotDeliver
    summary.failed = evaluated.report.bookingPromptCurrent.failed
    summary.durationMs = Date.now() - startedAt
    console.info('[coaching-booking-prompt] dry-run', {
      candidates: summary.candidates,
      alreadyBooked: summary.alreadyBooked,
      weekMondayKey: summary.weekMondayKey,
      wouldUsePush: summary.wouldUsePush,
      wouldFallbackEmail: summary.wouldFallbackEmail,
    })
    return { ok: true, summary }
  }

  const admin = createAdminClient()
  if (!admin) {
    summary.ok = false
    summary.failed = loaded.candidates.length
    summary.durationMs = Date.now() - startedAt
    return { ok: true, summary }
  }

  const senderId = await resolveCronSenderAdminId(admin)

  const handleCandidate = async (candidate: BookingPromptCandidate) => {
    if (Date.now() >= deadlineMs) {
      summary.timedOut = true
      summary.unprocessed += 1
      summary.ok = false
      return
    }

    const still = await studentStillUnbookedThisWeek(
      admin,
      candidate.studentId,
      loaded.weekDates,
    )
    if (!still.ok) {
      summary.failed += 1
      return
    }
    if (!still.unbooked) {
      summary.cancelledOrChanged += 1
      return
    }

    const chat = await ensureBookingPromptChat({
      admin,
      studentId: candidate.studentId,
      weekMondayKey: loaded.weekMondayKey,
      weekEndExclusiveKey,
      adminSenderId: senderId,
    })
    if (chat === 'failed') {
      summary.failed += 1
      return
    }
    if (chat === 'duplicate') summary.chatSkippedDuplicate += 1
    else summary.chatCreated += 1

    if (effective.mode === 'legacy') return

    const useNewPath =
      effective.mode === 'all' ||
      (effective.mode === 'allowlist' &&
        effective.allowlist != null &&
        effective.allowlist.has(candidate.studentId.toLowerCase()))

    if (!useNewPath) return

    const outcome = await processCoachingReminderNewPath({
      studentUserId: candidate.studentId,
      email: candidate.email,
      idempotencyKey: bookingPromptIdempotencyKey(loaded.weekMondayKey),
      kind: 'booking_prompt',
      pushBody: BOOKING_PROMPT_PUSH_BODY,
      tag: `coaching-booking-prompt-${loaded.weekMondayKey}`,
      deadlineMs,
      env,
    })
    tally(summary, outcome)
  }

  await mapPool(loaded.candidates, COACHING_REMINDER_STUDENT_CONCURRENCY, handleCandidate)
  summary.durationMs = Date.now() - startedAt
  return { ok: true, summary }
}

export function toPublicBookingPromptSummary(
  summary: BookingPromptRunSummary,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ok: summary.ok,
    mode: summary.mode,
    weekMondayKey: summary.weekMondayKey,
    candidates: summary.candidates,
    alreadyBooked: summary.alreadyBooked,
    chatCreated: summary.chatCreated,
    chatSkippedDuplicate: summary.chatSkippedDuplicate,
    pushSucceeded: summary.pushSucceeded,
    emailFallbackSucceeded: summary.emailFallbackSucceeded,
    preferenceDisabled: summary.preferenceDisabled,
    cancelledOrChanged: summary.cancelledOrChanged,
    cannotDeliver: summary.cannotDeliver,
    failed: summary.failed,
    unprocessed: summary.unprocessed,
    alreadyCompleted: summary.alreadyCompleted,
    nonProductionSkip: summary.nonProductionSkip,
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

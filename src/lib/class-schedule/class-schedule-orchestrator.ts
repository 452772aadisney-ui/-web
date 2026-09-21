import {
  CLASS_SCHEDULE_STUDENT_CONCURRENCY,
  classScheduleSoftDeadlineMs,
  resolveEffectiveClassScheduleMode,
  type ClassScheduleDeliveryMode,
} from '@/lib/class-schedule/class-schedule-delivery-mode'
import { type ClassScheduleNotifyKind } from '@/lib/class-schedule/class-schedule-email'
import {
  processClassScheduleNewPath,
  type ClassScheduleCandidate,
  type ClassScheduleNewPathOutcome,
} from '@/lib/class-schedule/class-schedule-new-path'
import {
  classifyClassScheduleDryRunFinal,
  type ClassScheduleDryRunFinalBucket,
} from '@/lib/class-schedule/class-schedule-dry-run'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPushSendingAvailable } from '@/lib/push/send-config'
import { fetchStudentList } from '@/lib/study/queries'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'
import { isKisotsuGradeTag } from '@/lib/tags/grade-order'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/push'

export type ClassScheduleDeliverySummary = {
  ok: boolean
  mode: ClassScheduleDeliveryMode
  recipients: number
  pushSucceeded: number
  emailFallbackSucceeded: number
  preferenceDisabled: number
  cannotDeliver: number
  failed: number
  legacyEmailRecipientCount: number
  legacyEmailSentCount: number
  alreadyCompleted: number
  inProgress: number
  stalePending: number
  emailFailed: number
  nonProductionSkip: number
  durationMs: number
  emailUnprocessedCount: number
  timedOut: boolean
  /** dry-run only */
  wouldUsePushFirst?: number
  wouldFallbackToEmail?: number
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

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

/**
 * Audience = all students with 学年=既卒 (via KISOTSU_GRADE_TAG / isKisotsuGradeTag).
 * Optional recipientStudentIds narrows to an explicit set (still kisotsu-filtered).
 */
export async function resolveClassScheduleCandidates(options?: {
  recipientStudentIds?: readonly string[]
}): Promise<ClassScheduleCandidate[]> {
  const [students, gradeMap] = await Promise.all([
    fetchStudentList(),
    fetchGradeTagNamesByStudentId(),
  ])

  // Explicit empty list = notify nobody (do not fall back to all kisotsu).
  if (options && 'recipientStudentIds' in options) {
    const ids = options.recipientStudentIds ?? []
    if (ids.length === 0) return []
    const allow = new Set(ids)
    return students
      .filter((student) => isKisotsuGradeTag(gradeMap.get(student.id)))
      .filter((student) => allow.has(student.id))
      .map((student) => ({
        studentId: student.id,
        email: student.email?.trim() ? student.email.trim() : null,
      }))
  }

  return students
    .filter((student) => isKisotsuGradeTag(gradeMap.get(student.id)))
    .map((student) => ({
      studentId: student.id,
      email: student.email?.trim() ? student.email.trim() : null,
    }))
}

/**
 * Day-level notify audience (venue change / day cancel):
 * - any all_kisotsu session on the day → all kisotsu
 * - otherwise union of targeted session attendees (deduped)
 *
 * Session-level / attendee-delta audiences must be passed explicitly via
 * recipientStudentIds — do not call this helper for those mutations.
 *
 * On query failure, throws (never falls back to all kisotsu).
 * Empty day with no sessions returns [].
 */
export async function resolveClassScheduleNotifyRecipientIdsForDay(
  dayId: string,
): Promise<'all_kisotsu' | string[]> {
  const admin = createAdminClient()
  if (!admin) {
    throw new Error('admin client unavailable for audience resolve')
  }

  const { data: sessions, error } = await admin
    .from('class_schedule_sessions')
    .select('id, audience_type')
    .eq('day_id', dayId)

  if (error) {
    throw new Error(`audience resolve failed: ${error.code ?? 'unknown'}`)
  }
  if (!sessions) {
    throw new Error('audience resolve returned null sessions')
  }

  if (sessions.length === 0) return []

  const hasAll = sessions.some(
    (s) => (s.audience_type ?? 'all_kisotsu') === 'all_kisotsu',
  )
  if (hasAll) return 'all_kisotsu'

  const sessionIds = sessions.map((s) => String(s.id))
  const { data: attendees, error: attendeeError } = await admin
    .from('class_schedule_session_attendees')
    .select('student_id')
    .in('session_id', sessionIds)

  if (attendeeError) {
    throw new Error(
      `attendee audience resolve failed: ${attendeeError.code ?? 'unknown'}`,
    )
  }

  return [...new Set((attendees ?? []).map((a) => String(a.student_id)))]
}

function emptySummary(
  mode: ClassScheduleDeliveryMode,
  forcedLegacyReason: ClassScheduleDeliverySummary['forcedLegacyReason'],
): ClassScheduleDeliverySummary {
  return {
    ok: true,
    mode,
    recipients: 0,
    pushSucceeded: 0,
    emailFallbackSucceeded: 0,
    preferenceDisabled: 0,
    cannotDeliver: 0,
    failed: 0,
    legacyEmailRecipientCount: 0,
    legacyEmailSentCount: 0,
    alreadyCompleted: 0,
    inProgress: 0,
    stalePending: 0,
    emailFailed: 0,
    nonProductionSkip: 0,
    durationMs: 0,
    emailUnprocessedCount: 0,
    timedOut: false,
    forcedLegacyReason,
  }
}

function tallyOutcome(
  summary: ClassScheduleDeliverySummary,
  outcome: ClassScheduleNewPathOutcome,
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
    case 'in_progress':
      summary.inProgress += 1
      break
    case 'stale_pending':
      summary.stalePending += 1
      break
    case 'email_failed':
      summary.emailFailed += 1
      summary.failed += 1
      break
    case 'undeliverable':
      summary.cannotDeliver += 1
      break
    case 'non_production_skip':
      summary.nonProductionSkip += 1
      break
    case 'timed_out':
      summary.timedOut = true
      summary.emailUnprocessedCount += 1
      summary.ok = false
      break
    case 'failed':
      summary.failed += 1
      break
  }
}

async function classifyDryRunCandidates(
  candidates: ClassScheduleCandidate[],
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Promise<{
  wouldUsePushFirst: number
  wouldFallbackToEmail: number
  preferenceDisabled: number
  cannotDeliver: number
  failed: number
}> {
  const admin = createAdminClient()
  const counts = {
    wouldUsePushFirst: 0,
    wouldFallbackToEmail: 0,
    preferenceDisabled: 0,
    cannotDeliver: 0,
    failed: 0,
  }

  if (!admin) {
    counts.failed = candidates.length
    return counts
  }

  const pushEnabled = isPushSendingAvailable(env)

  await mapPool(candidates, CLASS_SCHEDULE_STUDENT_CONCURRENCY, async (candidate) => {
    const { data: prefRow, error: prefError } = await admin
      .from('notification_preferences')
      .select('class_schedule')
      .eq('user_id', candidate.studentId)
      .maybeSingle<{ class_schedule: boolean }>()

    const { data: subs, error: subError } = await admin
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', candidate.studentId)
      .is('disabled_at', null)
      .limit(1)

    const bucket: ClassScheduleDryRunFinalBucket = classifyClassScheduleDryRunFinal({
      preferenceLookupOk: !prefError,
      preferenceEnabled: prefRow
        ? Boolean(prefRow.class_schedule)
        : DEFAULT_NOTIFICATION_PREFERENCES.class_schedule,
      subscriptionLookupOk: !subError,
      hasActivePush: (subs?.length ?? 0) > 0,
      emailLookupOk: true,
      hasEmail: Boolean(candidate.email),
      pushSendingEnabled: pushEnabled,
    })

    switch (bucket) {
      case 'preference_disabled':
        counts.preferenceDisabled += 1
        break
      case 'would_use_push':
        counts.wouldUsePushFirst += 1
        break
      case 'would_fallback_email':
        counts.wouldFallbackToEmail += 1
        break
      case 'cannot_deliver':
        counts.cannotDeliver += 1
        break
      case 'failed':
        counts.failed += 1
        break
    }
  })

  return counts
}

/**
 * Deliver class-schedule notifications after DB save.
 * Never throws for notification failures — returns a safe aggregate.
 * Saved schedule remains ok even if notify partially fails.
 */
export async function deliverClassScheduleNotifications(input: {
  dayId: string
  notifyRevision: number
  kind: ClassScheduleNotifyKind
  /** When set, only these students (still kisotsu-filtered). Omit = day aggregate. */
  recipientStudentIds?: readonly string[]
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<ClassScheduleDeliverySummary> {
  const startedAt = Date.now()
  const env = input.env ?? process.env
  const effective = resolveEffectiveClassScheduleMode(env)
  const deadlineMs = classScheduleSoftDeadlineMs(startedAt)
  const summary = emptySummary(effective.mode, effective.forcedLegacyReason)

  let candidates: ClassScheduleCandidate[]
  try {
    let recipientStudentIds = input.recipientStudentIds
    if (recipientStudentIds === undefined) {
      const resolved = await resolveClassScheduleNotifyRecipientIdsForDay(input.dayId)
      recipientStudentIds = resolved === 'all_kisotsu' ? undefined : resolved
    }
    candidates = await resolveClassScheduleCandidates(
      recipientStudentIds === undefined
        ? undefined
        : { recipientStudentIds },
    )
  } catch {
    console.error('[class-schedule-delivery] audience resolve failed')
    summary.ok = false
    summary.failed = 1
    summary.durationMs = Date.now() - startedAt
    return summary
  }

  summary.recipients = candidates.length

  // No prior email path for this feature: legacy = save/display only, no Push/email.
  if (effective.mode === 'legacy') {
    summary.durationMs = Date.now() - startedAt
    console.info('[class-schedule-delivery] legacy skip (no send):', {
      recipients: summary.recipients,
    })
    return summary
  }

  if (effective.mode === 'dry-run') {
    // No send, no events — classify only.
    const dry = await classifyDryRunCandidates(candidates, env)
    summary.wouldUsePushFirst = dry.wouldUsePushFirst
    summary.wouldFallbackToEmail = dry.wouldFallbackToEmail
    summary.preferenceDisabled = dry.preferenceDisabled
    summary.cannotDeliver = dry.cannotDeliver
    summary.failed += dry.failed
    summary.durationMs = Date.now() - startedAt
    console.info('[class-schedule-delivery] dry-run aggregate:', {
      recipients: summary.recipients,
      wouldUsePushFirst: summary.wouldUsePushFirst,
      wouldFallbackToEmail: summary.wouldFallbackToEmail,
      preferenceDisabled: summary.preferenceDisabled,
      cannotDeliver: summary.cannotDeliver,
    })
    return summary
  }

  // allowlist | all — only new-path Push-first (no legacy email fan-out).
  const newPathCandidates =
    effective.mode === 'allowlist' && effective.allowlist
      ? candidates.filter((c) => effective.allowlist!.has(c.studentId.toLowerCase()))
      : candidates

  const newPathOutcomes = await mapPool(
    newPathCandidates,
    CLASS_SCHEDULE_STUDENT_CONCURRENCY,
    async (candidate) => {
      if (Date.now() >= deadlineMs) return 'timed_out' as const
      return processClassScheduleNewPath({
        candidate,
        dayId: input.dayId,
        notifyRevision: input.notifyRevision,
        kind: input.kind,
        deadlineMs,
        env,
      })
    },
  )

  for (const outcome of newPathOutcomes) {
    tallyOutcome(summary, outcome)
  }

  summary.durationMs = Date.now() - startedAt
  return summary
}

export function classScheduleNotifySuccessMessage(
  savedMessage: string,
  summary: ClassScheduleDeliverySummary,
): string {
  const succeeded =
    summary.pushSucceeded +
    summary.emailFallbackSucceeded +
    summary.legacyEmailSentCount +
    summary.alreadyCompleted

  const failedLike =
    summary.failed +
    summary.cannotDeliver +
    summary.emailUnprocessedCount +
    summary.stalePending

  const attempted =
    summary.recipients - summary.preferenceDisabled - summary.nonProductionSkip

  if (summary.mode === 'dry-run') {
    return savedMessage
  }

  if (attempted <= 0 || failedLike === 0) {
    return savedMessage
  }

  if (succeeded === 0) {
    return `${savedMessage}（通知を送信できませんでした）`
  }

  return `${savedMessage}（一部の通知を送信できませんでした）`
}

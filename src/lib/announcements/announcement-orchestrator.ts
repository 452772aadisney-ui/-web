import {
  buildProfileTagMap,
  resolveAnnouncementAudience,
} from '@/lib/announcements/audience'
import {
  ANNOUNCEMENT_STUDENT_CONCURRENCY,
  announcementSoftDeadlineMs,
  resolveEffectiveAnnouncementMode,
  type AnnouncementDeliveryMode,
} from '@/lib/announcements/announcement-delivery-mode'
import {
  buildAnnouncementEmailSubject,
  buildAnnouncementEmailText,
} from '@/lib/announcements/announcement-email'
import {
  processAnnouncementNewPath,
  type AnnouncementCandidate,
  type AnnouncementNewPathOutcome,
} from '@/lib/announcements/announcement-new-path'
import {
  classifyAnnouncementDryRunFinal,
  type AnnouncementDryRunFinalBucket,
} from '@/lib/announcements/announcement-dry-run'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sendEmailToMany } from '@/lib/email/send'
import { isPushSendingAvailable } from '@/lib/push/send-config'
import { fetchStudentList } from '@/lib/study/queries'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/push'

export type AnnouncementDeliverySummary = {
  ok: boolean
  mode: AnnouncementDeliveryMode
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

async function fetchProfileTagAssignments(): Promise<
  Array<{ profile_id: string; tag_id: string }>
> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profile_student_tags')
    .select('profile_id, tag_id')

  if (error) {
    console.error('[announcement-delivery] profile tags query failed')
    return []
  }

  return (data ?? []) as Array<{ profile_id: string; tag_id: string }>
}

/**
 * Resolve announcement audience to delivery candidates (role=student via fetchStudentList).
 * Preserves existing target_all / tag / individual targeting (OR union).
 */
export async function resolveAnnouncementCandidates(input: {
  announcementId: string
  title: string
  targetAll: boolean
  tagIds: string[]
  studentIds: string[]
}): Promise<AnnouncementCandidate[]> {
  const [students, tagAssignments] = await Promise.all([
    fetchStudentList(),
    fetchProfileTagAssignments(),
  ])

  const studentSummaries = students.map((student) => ({
    id: student.id,
    full_name: student.full_name,
    display_name: student.display_name,
  }))

  const audience = resolveAnnouncementAudience(
    {
      id: input.announcementId,
      title: input.title,
      body: '',
      created_at: '',
      updated_at: '',
      created_by: null,
      target_all: input.targetAll,
      target_tag_ids: input.tagIds,
      target_student_ids: input.studentIds,
    },
    studentSummaries,
    buildProfileTagMap(tagAssignments),
  )

  const audienceIds = new Set(audience.map((s) => s.id))
  return students
    .filter((student) => audienceIds.has(student.id))
    .map((student) => ({
      studentId: student.id,
      email: student.email?.trim() ? student.email.trim() : null,
    }))
}

async function runLegacyPacedEmail(params: {
  candidates: AnnouncementCandidate[]
  announcementId: string
  title: string
  deadlineMs: number
}): Promise<{
  recipientCount: number
  sentCount: number
  failedCount: number
  unprocessedCount: number
  timedOut: boolean
}> {
  const emails = params.candidates
    .map((c) => c.email)
    .filter((email): email is string => Boolean(email))

  console.info('[announcement-delivery] legacy email:', {
    announcementId: params.announcementId,
    audienceCount: params.candidates.length,
    emailCount: emails.length,
    configured: Boolean(
      process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim(),
    ),
  })

  if (params.candidates.length > 0 && emails.length === 0) {
    console.warn('[announcement-delivery] audience exists but no emails found')
  }

  const result = await sendEmailToMany(emails, {
    subject: buildAnnouncementEmailSubject(params.title),
    text: buildAnnouncementEmailText({
      title: params.title,
      announcementId: params.announcementId,
    }),
    pace: true,
    omitRecipientFromLogs: true,
    deadlineMs: params.deadlineMs,
  })

  return {
    recipientCount: result.recipientCount,
    sentCount: result.sentCount,
    failedCount: result.failedCount + result.skippedCount,
    unprocessedCount: result.unprocessedCount,
    timedOut: result.timedOut,
  }
}

function emptySummary(
  mode: AnnouncementDeliveryMode,
  forcedLegacyReason: AnnouncementDeliverySummary['forcedLegacyReason'],
): AnnouncementDeliverySummary {
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
  summary: AnnouncementDeliverySummary,
  outcome: AnnouncementNewPathOutcome,
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
  candidates: AnnouncementCandidate[],
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

  await mapPool(candidates, ANNOUNCEMENT_STUDENT_CONCURRENCY, async (candidate) => {
    const { data: prefRow, error: prefError } = await admin
      .from('notification_preferences')
      .select('announcement')
      .eq('user_id', candidate.studentId)
      .maybeSingle<{ announcement: boolean }>()

    const { data: subs, error: subError } = await admin
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', candidate.studentId)
      .is('disabled_at', null)
      .limit(1)

    const bucket: AnnouncementDryRunFinalBucket = classifyAnnouncementDryRunFinal({
      preferenceLookupOk: !prefError,
      preferenceEnabled: prefRow
        ? Boolean(prefRow.announcement)
        : DEFAULT_NOTIFICATION_PREFERENCES.announcement,
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
 * Deliver announcement notifications after DB save.
 * Never throws for notification failures — returns a safe aggregate.
 */
export async function deliverAnnouncementNotifications(input: {
  announcementId: string
  title: string
  targetAll: boolean
  tagIds: string[]
  studentIds: string[]
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<AnnouncementDeliverySummary> {
  const startedAt = Date.now()
  const env = input.env ?? process.env
  const effective = resolveEffectiveAnnouncementMode(env)
  const deadlineMs = announcementSoftDeadlineMs(startedAt)
  const summary = emptySummary(effective.mode, effective.forcedLegacyReason)

  let candidates: AnnouncementCandidate[]
  try {
    candidates = await resolveAnnouncementCandidates(input)
  } catch {
    console.error('[announcement-delivery] audience resolve failed')
    summary.ok = false
    summary.failed = 1
    summary.durationMs = Date.now() - startedAt
    return summary
  }

  summary.recipients = candidates.length

  if (effective.mode === 'legacy') {
    const legacy = await runLegacyPacedEmail({
      candidates,
      announcementId: input.announcementId,
      title: input.title,
      deadlineMs,
    })
    summary.legacyEmailRecipientCount = legacy.recipientCount
    summary.legacyEmailSentCount = legacy.sentCount
    summary.failed += legacy.failedCount
    summary.emailUnprocessedCount += legacy.unprocessedCount
    if (legacy.timedOut) {
      summary.timedOut = true
      summary.ok = false
    }
    if (legacy.recipientCount > 0 && legacy.sentCount === 0 && legacy.failedCount > 0) {
      summary.ok = false
    }
    summary.durationMs = Date.now() - startedAt
    return toPublicSafeSummary(summary)
  }

  if (effective.mode === 'dry-run') {
    const dry = await classifyDryRunCandidates(candidates, env)
    summary.wouldUsePushFirst = dry.wouldUsePushFirst
    summary.wouldFallbackToEmail = dry.wouldFallbackToEmail
    summary.preferenceDisabled = dry.preferenceDisabled
    summary.cannotDeliver = dry.cannotDeliver
    summary.failed += dry.failed

    const legacy = await runLegacyPacedEmail({
      candidates,
      announcementId: input.announcementId,
      title: input.title,
      deadlineMs,
    })
    summary.legacyEmailRecipientCount = legacy.recipientCount
    summary.legacyEmailSentCount = legacy.sentCount
    summary.failed += legacy.failedCount
    summary.emailUnprocessedCount += legacy.unprocessedCount
    if (legacy.timedOut) {
      summary.timedOut = true
      summary.ok = false
    }
    summary.durationMs = Date.now() - startedAt
    console.info('[announcement-delivery] dry-run aggregate:', {
      recipients: summary.recipients,
      wouldUsePushFirst: summary.wouldUsePushFirst,
      wouldFallbackToEmail: summary.wouldFallbackToEmail,
      preferenceDisabled: summary.preferenceDisabled,
      cannotDeliver: summary.cannotDeliver,
    })
    return toPublicSafeSummary(summary)
  }

  // allowlist | all
  const newPathCandidates =
    effective.mode === 'allowlist' && effective.allowlist
      ? candidates.filter((c) => effective.allowlist!.has(c.studentId.toLowerCase()))
      : candidates

  const legacyCandidates =
    effective.mode === 'allowlist' && effective.allowlist
      ? candidates.filter((c) => !effective.allowlist!.has(c.studentId.toLowerCase()))
      : []

  const newPathOutcomes = await mapPool(
    newPathCandidates,
    ANNOUNCEMENT_STUDENT_CONCURRENCY,
    async (candidate) => {
      if (Date.now() >= deadlineMs) return 'timed_out' as const
      return processAnnouncementNewPath({
        candidate,
        announcementId: input.announcementId,
        title: input.title,
        deadlineMs,
        env,
      })
    },
  )

  for (const outcome of newPathOutcomes) {
    tallyOutcome(summary, outcome)
  }

  if (legacyCandidates.length > 0) {
    const legacy = await runLegacyPacedEmail({
      candidates: legacyCandidates,
      announcementId: input.announcementId,
      title: input.title,
      deadlineMs,
    })
    summary.legacyEmailRecipientCount = legacy.recipientCount
    summary.legacyEmailSentCount = legacy.sentCount
    summary.failed += legacy.failedCount
    summary.emailUnprocessedCount += legacy.unprocessedCount
    if (legacy.timedOut) {
      summary.timedOut = true
      summary.ok = false
    }
  }

  summary.durationMs = Date.now() - startedAt
  return toPublicSafeSummary(summary)
}

/** Strip any accidental extras; counts only. */
export function toPublicSafeSummary(
  summary: AnnouncementDeliverySummary,
): AnnouncementDeliverySummary {
  return { ...summary }
}

export function announcementPublishSuccessMessage(
  summary: AnnouncementDeliverySummary,
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

  if (attempted <= 0 || failedLike === 0) {
    return 'お知らせを公開しました'
  }

  if (succeeded === 0) {
    return 'お知らせは公開しましたが、通知を送信できませんでした'
  }

  return 'お知らせは公開しましたが、一部の通知を送信できませんでした'
}

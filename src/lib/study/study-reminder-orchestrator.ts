import {
  notifyStudentsMissingTodayStudyLog,
} from '@/lib/email/notifications'
import {
  buildTodayMissingStudyReport,
  type DailyStudyDigestReport,
} from '@/lib/study/digest'
import {
  STUDY_REMINDER_STUDENT_CONCURRENCY,
  resolveEffectiveStudyReminderMode,
  type StudyReminderDeliveryMode,
} from '@/lib/study/study-reminder-mode'
import {
  processStudyReminderNewPath,
  type StudyReminderCandidate,
  type StudyReminderNewPathOutcome,
} from '@/lib/study/study-reminder-new-path'
import { evaluateStudyReminderDryRunAggregate } from '@/lib/study/study-reminder-dry-run'

export type StudyReminderRunSummary = {
  ok: boolean
  mode: StudyReminderDeliveryMode
  dateKey: string
  candidates: number
  legacyEmailRecipientCount: number
  legacyEmailSentCount: number
  pushSent: number
  emailFallbackSent: number
  preferenceDisabled: number
  recordedBeforeSend: number
  undeliverable: number
  alreadyCompleted: number
  inProgress: number
  stalePending: number
  emailFailed: number
  nonProductionSkip: number
  failed: number
  /** dry-run only fields */
  wouldUsePushFirst?: number
  wouldFallbackToEmail?: number
  noPushSubscription?: number
  noEmail?: number
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

function toCandidates(
  report: DailyStudyDigestReport,
): StudyReminderCandidate[] {
  return report.notRecorded.map((s) => ({
    studentId: s.studentId,
    email: s.email,
  }))
}

function filterReportExcluding(
  report: DailyStudyDigestReport,
  excludeIds: ReadonlySet<string>,
): DailyStudyDigestReport {
  if (excludeIds.size === 0) return report
  return {
    ...report,
    notRecorded: report.notRecorded.filter((s) => !excludeIds.has(s.studentId)),
  }
}

function emptySummary(
  mode: StudyReminderDeliveryMode,
  dateKey: string,
  forcedLegacyReason: StudyReminderRunSummary['forcedLegacyReason'],
): StudyReminderRunSummary {
  return {
    ok: true,
    mode,
    dateKey,
    candidates: 0,
    legacyEmailRecipientCount: 0,
    legacyEmailSentCount: 0,
    pushSent: 0,
    emailFallbackSent: 0,
    preferenceDisabled: 0,
    recordedBeforeSend: 0,
    undeliverable: 0,
    alreadyCompleted: 0,
    inProgress: 0,
    stalePending: 0,
    emailFailed: 0,
    nonProductionSkip: 0,
    failed: 0,
    forcedLegacyReason,
  }
}

function tallyOutcome(
  summary: StudyReminderRunSummary,
  outcome: StudyReminderNewPathOutcome,
) {
  switch (outcome) {
    case 'push_sent':
      summary.pushSent += 1
      break
    case 'email_sent':
      summary.emailFallbackSent += 1
      break
    case 'preference_disabled':
      summary.preferenceDisabled += 1
      break
    case 'recorded_before_send':
      summary.recordedBeforeSend += 1
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
      break
    case 'undeliverable':
      summary.undeliverable += 1
      break
    case 'non_production_skip':
      summary.nonProductionSkip += 1
      break
    case 'failed':
      summary.failed += 1
      break
  }
}

async function runLegacyEmail(
  report: DailyStudyDigestReport,
): Promise<{ recipientCount: number; sentCount: number }> {
  const result = await notifyStudentsMissingTodayStudyLog(report)
  return {
    recipientCount: result.recipientCount,
    sentCount: result.sentCount,
  }
}

/**
 * Orchestrate the 22:00 JST missing-study reminder for the given mode.
 */
export async function runStudyReminderJob(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Promise<
  | { ok: true; summary: StudyReminderRunSummary }
  | { ok: false; error: 'build_failed' }
> {
  const resolved = resolveEffectiveStudyReminderMode(env)
  const report = await buildTodayMissingStudyReport()
  if (!report) {
    return { ok: false, error: 'build_failed' }
  }

  const summary = emptySummary(
    resolved.mode,
    report.dateKey,
    resolved.forcedLegacyReason,
  )
  summary.candidates = report.notRecorded.length

  if (resolved.mode === 'legacy') {
    const legacy = await runLegacyEmail(report)
    summary.legacyEmailRecipientCount = legacy.recipientCount
    summary.legacyEmailSentCount = legacy.sentCount
    return { ok: true, summary }
  }

  if (resolved.mode === 'dry-run') {
    const candidateIds = new Set(report.notRecorded.map((s) => s.studentId))
    const evaluated = await evaluateStudyReminderDryRunAggregate({
      dateKey: report.dateKey,
      env,
      studentIds: candidateIds,
    })
    if (!evaluated.ok) {
      return { ok: false, error: 'build_failed' }
    }

    // Actual delivery remains legacy email.
    const legacy = await runLegacyEmail(report)
    summary.legacyEmailRecipientCount = legacy.recipientCount
    summary.legacyEmailSentCount = legacy.sentCount
    summary.wouldUsePushFirst = evaluated.aggregate.wouldUsePushFirst
    summary.wouldFallbackToEmail = evaluated.aggregate.wouldFallbackToEmail
    summary.preferenceDisabled = evaluated.aggregate.preferenceDisabled
    summary.noPushSubscription = evaluated.aggregate.wouldFallbackToEmail
    summary.noEmail = evaluated.aggregate.cannotDeliver
    summary.recordedBeforeSend = evaluated.aggregate.alreadyRecorded
    summary.failed = evaluated.aggregate.failedToEvaluate
    return { ok: true, summary }
  }

  if (resolved.mode === 'allowlist') {
    const allowlist = resolved.allowlist!
    const newPathStudents = report.notRecorded.filter((s) =>
      allowlist.has(s.studentId.toLowerCase()),
    )
    const legacyReport = filterReportExcluding(
      report,
      new Set(newPathStudents.map((s) => s.studentId)),
    )

    const outcomes = await mapPool(
      toCandidates({ ...report, notRecorded: newPathStudents }),
      STUDY_REMINDER_STUDENT_CONCURRENCY,
      (candidate) =>
        processStudyReminderNewPath({
          candidate,
          dateKey: report.dateKey,
          dateLabel: report.dateLabel,
          env,
        }),
    )
    for (const outcome of outcomes) tallyOutcome(summary, outcome)

    const legacy = await runLegacyEmail(legacyReport)
    summary.legacyEmailRecipientCount = legacy.recipientCount
    summary.legacyEmailSentCount = legacy.sentCount
    return { ok: true, summary }
  }

  // mode === 'all'
  const outcomes = await mapPool(
    toCandidates(report),
    STUDY_REMINDER_STUDENT_CONCURRENCY,
    (candidate) =>
      processStudyReminderNewPath({
        candidate,
        dateKey: report.dateKey,
        dateLabel: report.dateLabel,
        env,
      }),
  )
  for (const outcome of outcomes) tallyOutcome(summary, outcome)
  return { ok: true, summary }
}

/** Safe log/response payload (no PII). */
export function toPublicStudyReminderSummary(
  summary: StudyReminderRunSummary,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ok: summary.ok,
    mode: summary.mode,
    dateKey: summary.dateKey,
    candidates: summary.candidates,
    legacyEmailRecipientCount: summary.legacyEmailRecipientCount,
    legacyEmailSentCount: summary.legacyEmailSentCount,
    pushSent: summary.pushSent,
    emailFallbackSent: summary.emailFallbackSent,
    preferenceDisabled: summary.preferenceDisabled,
    recordedBeforeSend: summary.recordedBeforeSend,
    undeliverable: summary.undeliverable,
    alreadyCompleted: summary.alreadyCompleted,
    inProgress: summary.inProgress,
    stalePending: summary.stalePending,
    emailFailed: summary.emailFailed,
    nonProductionSkip: summary.nonProductionSkip,
    failed: summary.failed,
  }

  if (summary.forcedLegacyReason) {
    base.forcedLegacyReason = summary.forcedLegacyReason
  }

  if (summary.mode === 'dry-run') {
    base.wouldUsePushFirst = summary.wouldUsePushFirst ?? 0
    base.wouldFallbackToEmail = summary.wouldFallbackToEmail ?? 0
    base.noPushSubscription = summary.noPushSubscription ?? 0
    base.noEmail = summary.noEmail ?? 0
  }

  return base
}

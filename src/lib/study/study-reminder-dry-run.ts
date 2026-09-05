/**
 * Shared study-reminder dry-run classification (read-only).
 * Used by Cron dry-run mode and admin full dry-run so results stay aligned.
 * Never sends Push/email or writes notification events/deliveries.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { isPushSendingAvailable } from '@/lib/push/send-config'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/push'
import { getJstDateKey } from '@/lib/study/dates'
import { resolveEffectiveStudyReminderMode } from '@/lib/study/study-reminder-mode'

const PAGE_SIZE = 1000
/** Keep `.in(...)` URL length under PostgREST limits. */
const IN_CHUNK_SIZE = 100

/** Mutually exclusive final buckets (each student counted once). */
export type StudyReminderDryRunFinalBucket =
  | 'already_recorded'
  | 'preference_disabled'
  | 'would_use_push'
  | 'would_fallback_email'
  | 'cannot_deliver'
  | 'failed'

export type StudyReminderDryRunClassifyInput = {
  recordedLookupOk: boolean
  hasLog: boolean
  preferenceLookupOk: boolean
  preferenceEnabled: boolean
  subscriptionLookupOk: boolean
  hasActivePush: boolean
  emailLookupOk: boolean
  hasEmail: boolean
  pushSendingEnabled: boolean
}

/**
 * Pure classifier shared by Cron dry-run and admin full dry-run.
 * Order matches the live new-path gates (record → preference → push → email).
 */
export function classifyStudyReminderDryRunFinal(
  input: StudyReminderDryRunClassifyInput,
): StudyReminderDryRunFinalBucket {
  if (
    !input.recordedLookupOk ||
    !input.preferenceLookupOk ||
    !input.subscriptionLookupOk ||
    !input.emailLookupOk
  ) {
    return 'failed'
  }
  if (input.hasLog) return 'already_recorded'
  if (!input.preferenceEnabled) return 'preference_disabled'
  if (input.hasActivePush && input.pushSendingEnabled) return 'would_use_push'
  if (input.hasEmail) return 'would_fallback_email'
  return 'cannot_deliver'
}

export type StudyReminderDryRunAggregate = {
  dateKey: string
  evaluatedAt: string
  durationMs: number
  deliveryMode: string
  pushSendingEnabled: boolean
  /** Final mutually exclusive counts */
  totalStudents: number
  alreadyRecorded: number
  preferenceDisabled: number
  wouldUsePushFirst: number
  wouldFallbackToEmail: number
  cannotDeliver: number
  failedToEvaluate: number
  /** Reference (may overlap; not used for sum checks) */
  missingStudyLog: number
  preferenceEnabled: number
  withActivePushSubscription: number
  withoutActivePushSubscription: number
}

export function emptyDryRunAggregate(
  dateKey: string,
  extras: {
    deliveryMode: string
    pushSendingEnabled: boolean
    evaluatedAt?: string
    durationMs?: number
  },
): StudyReminderDryRunAggregate {
  return {
    dateKey,
    evaluatedAt: extras.evaluatedAt ?? new Date().toISOString(),
    durationMs: extras.durationMs ?? 0,
    deliveryMode: extras.deliveryMode,
    pushSendingEnabled: extras.pushSendingEnabled,
    totalStudents: 0,
    alreadyRecorded: 0,
    preferenceDisabled: 0,
    wouldUsePushFirst: 0,
    wouldFallbackToEmail: 0,
    cannotDeliver: 0,
    failedToEvaluate: 0,
    missingStudyLog: 0,
    preferenceEnabled: 0,
    withActivePushSubscription: 0,
    withoutActivePushSubscription: 0,
  }
}

export function assertDryRunFinalSum(aggregate: StudyReminderDryRunAggregate): boolean {
  const sum =
    aggregate.alreadyRecorded +
    aggregate.preferenceDisabled +
    aggregate.wouldUsePushFirst +
    aggregate.wouldFallbackToEmail +
    aggregate.cannotDeliver +
    aggregate.failedToEvaluate
  return sum === aggregate.totalStudents
}

function tallyFinal(
  aggregate: StudyReminderDryRunAggregate,
  bucket: StudyReminderDryRunFinalBucket,
) {
  switch (bucket) {
    case 'already_recorded':
      aggregate.alreadyRecorded += 1
      break
    case 'preference_disabled':
      aggregate.preferenceDisabled += 1
      break
    case 'would_use_push':
      aggregate.wouldUsePushFirst += 1
      break
    case 'would_fallback_email':
      aggregate.wouldFallbackToEmail += 1
      break
    case 'cannot_deliver':
      aggregate.cannotDeliver += 1
      break
    case 'failed':
      aggregate.failedToEvaluate += 1
      break
  }
}

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size))
  }
  return chunks
}

async function fetchAllPages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ ok: true; rows: T[] } | { ok: false }> {
  const rows: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
    if (error) return { ok: false }
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { ok: true, rows }
}

/**
 * Bulk read-only evaluation for all students (or a prefiltered id set).
 * Selects only id/email/flags — never endpoints or keys.
 */
export async function evaluateStudyReminderDryRunAggregate(params?: {
  dateKey?: string
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
  /** When set, only these student IDs are evaluated (Cron candidate path). */
  studentIds?: ReadonlySet<string>
  /** Precomputed hasLog map when caller already loaded study logs. */
  hasLogByStudentId?: ReadonlyMap<string, boolean>
}): Promise<
  | { ok: true; aggregate: StudyReminderDryRunAggregate }
  | { ok: false; code: 'admin_unavailable' | 'query_failed' }
> {
  const started = Date.now()
  const env = params?.env ?? process.env
  const dateKey = params?.dateKey ?? getJstDateKey()
  const pushSendingEnabled = isPushSendingAvailable(env)
  const deliveryMode = resolveEffectiveStudyReminderMode(env).mode

  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  const aggregate = emptyDryRunAggregate(dateKey, {
    deliveryMode,
    pushSendingEnabled,
    evaluatedAt: new Date().toISOString(),
  })

  const loaded = await loadDryRunSnapshots(admin, dateKey, params?.studentIds)
  if (!loaded.ok) return { ok: false, code: 'query_failed' }

  const hasLogByStudentId = params?.hasLogByStudentId ?? loaded.hasLogByStudentId

  for (const student of loaded.students) {
    aggregate.totalStudents += 1

    const hasLog = hasLogByStudentId.get(student.id) === true
    const pref = loaded.preferenceByUserId.get(student.id)
    const preferenceEnabled =
      pref === undefined ? DEFAULT_NOTIFICATION_PREFERENCES.study_reminder : pref
    const hasActivePush = loaded.pushUserIds.has(student.id)
    const hasEmail = student.hasEmail

    if (!hasLog) aggregate.missingStudyLog += 1
    if (preferenceEnabled) aggregate.preferenceEnabled += 1
    if (hasActivePush) aggregate.withActivePushSubscription += 1
    else aggregate.withoutActivePushSubscription += 1

    const bucket = classifyStudyReminderDryRunFinal({
      recordedLookupOk: true,
      hasLog,
      preferenceLookupOk: true,
      preferenceEnabled,
      subscriptionLookupOk: true,
      hasActivePush,
      emailLookupOk: true,
      hasEmail,
      pushSendingEnabled,
    })
    tallyFinal(aggregate, bucket)
  }

  aggregate.durationMs = Date.now() - started
  return { ok: true, aggregate }
}

async function loadDryRunSnapshots(
  admin: AdminClient,
  dateKey: string,
  onlyStudentIds?: ReadonlySet<string>,
): Promise<
  | {
      ok: true
      students: Array<{ id: string; hasEmail: boolean }>
      hasLogByStudentId: Map<string, boolean>
      preferenceByUserId: Map<string, boolean>
      pushUserIds: Set<string>
    }
  | { ok: false }
> {
  if (onlyStudentIds && onlyStudentIds.size === 0) {
    return {
      ok: true,
      students: [],
      hasLogByStudentId: new Map(),
      preferenceByUserId: new Map(),
      pushUserIds: new Set(),
    }
  }

  const students = await loadStudents(admin, onlyStudentIds)
  if (!students.ok) return { ok: false }

  const [logs, prefs, push] = await Promise.all([
    loadStudyLogStudentIds(admin, dateKey, onlyStudentIds),
    loadPreferences(admin, onlyStudentIds),
    loadActivePushUserIds(admin, onlyStudentIds),
  ])

  if (!logs.ok || !prefs.ok || !push.ok) {
    console.error('[study-reminder-dry-run] snapshot query failed')
    return { ok: false }
  }

  return {
    ok: true,
    students: students.students,
    hasLogByStudentId: logs.hasLogByStudentId,
    preferenceByUserId: prefs.preferenceByUserId,
    pushUserIds: push.pushUserIds,
  }
}

async function loadStudents(
  admin: AdminClient,
  onlyStudentIds?: ReadonlySet<string>,
): Promise<{ ok: true; students: Array<{ id: string; hasEmail: boolean }> } | { ok: false }> {
  type Row = { id: string; email: string | null }

  if (!onlyStudentIds) {
    const fetched = await fetchAllPages<Row>((from, to) =>
      admin
        .from('profiles')
        .select('id, email')
        .eq('role', 'student')
        .range(from, to),
    )
    if (!fetched.ok) {
      console.error('[study-reminder-dry-run] students query failed')
      return { ok: false }
    }
    return { ok: true, students: mapStudentRows(fetched.rows) }
  }

  const students: Array<{ id: string; hasEmail: boolean }> = []
  for (const chunk of chunkIds([...onlyStudentIds], IN_CHUNK_SIZE)) {
    const fetched = await fetchAllPages<Row>((from, to) =>
      admin
        .from('profiles')
        .select('id, email')
        .eq('role', 'student')
        .in('id', chunk)
        .range(from, to),
    )
    if (!fetched.ok) {
      console.error('[study-reminder-dry-run] students query failed')
      return { ok: false }
    }
    students.push(...mapStudentRows(fetched.rows))
  }
  return { ok: true, students }
}

function mapStudentRows(
  rows: Array<{ id: string; email: string | null }>,
): Array<{ id: string; hasEmail: boolean }> {
  return rows.map((row) => {
    const email = typeof row.email === 'string' ? row.email.trim() : ''
    return {
      id: String(row.id),
      hasEmail: email.length > 0,
    }
  })
}

async function loadStudyLogStudentIds(
  admin: AdminClient,
  dateKey: string,
  onlyStudentIds?: ReadonlySet<string>,
): Promise<{ ok: true; hasLogByStudentId: Map<string, boolean> } | { ok: false }> {
  type Row = { student_id: string }
  const hasLogByStudentId = new Map<string, boolean>()

  if (!onlyStudentIds) {
    const fetched = await fetchAllPages<Row>((from, to) =>
      admin.from('study_logs').select('student_id').eq('studied_on', dateKey).range(from, to),
    )
    if (!fetched.ok) return { ok: false }
    for (const row of fetched.rows) {
      hasLogByStudentId.set(String(row.student_id), true)
    }
    return { ok: true, hasLogByStudentId }
  }

  for (const chunk of chunkIds([...onlyStudentIds], IN_CHUNK_SIZE)) {
    const fetched = await fetchAllPages<Row>((from, to) =>
      admin
        .from('study_logs')
        .select('student_id')
        .eq('studied_on', dateKey)
        .in('student_id', chunk)
        .range(from, to),
    )
    if (!fetched.ok) return { ok: false }
    for (const row of fetched.rows) {
      hasLogByStudentId.set(String(row.student_id), true)
    }
  }
  return { ok: true, hasLogByStudentId }
}

async function loadPreferences(
  admin: AdminClient,
  onlyStudentIds?: ReadonlySet<string>,
): Promise<{ ok: true; preferenceByUserId: Map<string, boolean> } | { ok: false }> {
  type Row = { user_id: string; study_reminder: boolean }
  const preferenceByUserId = new Map<string, boolean>()

  if (!onlyStudentIds) {
    const fetched = await fetchAllPages<Row>((from, to) =>
      admin.from('notification_preferences').select('user_id, study_reminder').range(from, to),
    )
    if (!fetched.ok) return { ok: false }
    for (const row of fetched.rows) {
      preferenceByUserId.set(String(row.user_id), Boolean(row.study_reminder))
    }
    return { ok: true, preferenceByUserId }
  }

  for (const chunk of chunkIds([...onlyStudentIds], IN_CHUNK_SIZE)) {
    const fetched = await fetchAllPages<Row>((from, to) =>
      admin
        .from('notification_preferences')
        .select('user_id, study_reminder')
        .in('user_id', chunk)
        .range(from, to),
    )
    if (!fetched.ok) return { ok: false }
    for (const row of fetched.rows) {
      preferenceByUserId.set(String(row.user_id), Boolean(row.study_reminder))
    }
  }
  return { ok: true, preferenceByUserId }
}

async function loadActivePushUserIds(
  admin: AdminClient,
  onlyStudentIds?: ReadonlySet<string>,
): Promise<{ ok: true; pushUserIds: Set<string> } | { ok: false }> {
  type Row = { user_id: string }
  const pushUserIds = new Set<string>()

  if (!onlyStudentIds) {
    const fetched = await fetchAllPages<Row>((from, to) =>
      admin
        .from('push_subscriptions')
        .select('user_id')
        .is('disabled_at', null)
        .range(from, to),
    )
    if (!fetched.ok) return { ok: false }
    for (const row of fetched.rows) {
      pushUserIds.add(String(row.user_id))
    }
    return { ok: true, pushUserIds }
  }

  for (const chunk of chunkIds([...onlyStudentIds], IN_CHUNK_SIZE)) {
    const fetched = await fetchAllPages<Row>((from, to) =>
      admin
        .from('push_subscriptions')
        .select('user_id')
        .is('disabled_at', null)
        .in('user_id', chunk)
        .range(from, to),
    )
    if (!fetched.ok) return { ok: false }
    for (const row of fetched.rows) {
      pushUserIds.add(String(row.user_id))
    }
  }
  return { ok: true, pushUserIds }
}


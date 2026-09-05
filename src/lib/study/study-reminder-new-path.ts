import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushNotification } from '@/lib/push/send-service'
import { isPushSendingAvailable } from '@/lib/push/send-config'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/push'
import {
  STUDY_REMINDER_PENDING_STALE_MS,
  isVercelNonProduction,
} from '@/lib/study/study-reminder-mode'
import {
  STUDY_REMINDER_PUSH_BODY,
  STUDY_REMINDER_PUSH_PATH,
  STUDY_REMINDER_PUSH_TITLE,
  sendMissingStudyLogEmail,
} from '@/lib/study/study-reminder-email'

export type StudyReminderNewPathOutcome =
  | 'push_sent'
  | 'email_sent'
  | 'preference_disabled'
  | 'recorded_before_send'
  | 'already_completed'
  | 'in_progress'
  | 'stale_pending'
  | 'email_failed'
  | 'undeliverable'
  | 'non_production_skip'
  | 'failed'

export type StudyReminderCandidate = {
  studentId: string
  email: string | null
}

type DeliveryRow = {
  id: string
  channel: 'push' | 'email'
  status: 'pending' | 'sent' | 'failed' | 'skipped'
  sent_at: string | null
  created_at: string
}

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

export async function hasStudyLogOnDate(
  admin: AdminClient,
  studentId: string,
  dateKey: string,
): Promise<{ ok: true; hasLog: boolean } | { ok: false }> {
  const { data, error } = await admin
    .from('study_logs')
    .select('id')
    .eq('student_id', studentId)
    .eq('studied_on', dateKey)
    .limit(1)

  if (error) return { ok: false }
  return { ok: true, hasLog: (data?.length ?? 0) > 0 }
}

export async function getStudyReminderPreferenceEnabled(
  admin: AdminClient,
  userId: string,
): Promise<{ ok: true; enabled: boolean } | { ok: false }> {
  const { data, error } = await admin
    .from('notification_preferences')
    .select('study_reminder')
    .eq('user_id', userId)
    .maybeSingle<{ study_reminder: boolean }>()

  if (error) return { ok: false }
  if (!data) return { ok: true, enabled: DEFAULT_NOTIFICATION_PREFERENCES.study_reminder }
  return { ok: true, enabled: Boolean(data.study_reminder) }
}

export async function countActivePushSubscriptions(
  admin: AdminClient,
  userId: string,
): Promise<{ ok: true; count: number } | { ok: false }> {
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .is('disabled_at', null)
    .limit(20)

  if (error) return { ok: false }
  return { ok: true, count: data?.length ?? 0 }
}

async function findStudyReminderEvent(
  admin: AdminClient,
  userId: string,
  dateKey: string,
): Promise<{ ok: true; eventId: string | null } | { ok: false }> {
  const { data, error } = await admin
    .from('notification_events')
    .select('id')
    .eq('user_id', userId)
    .eq('notification_type', 'study_reminder')
    .eq('idempotency_key', dateKey)
    .maybeSingle<{ id: string }>()

  if (error) return { ok: false }
  return { ok: true, eventId: data?.id ?? null }
}

async function getOrCreateStudyReminderEvent(
  admin: AdminClient,
  userId: string,
  dateKey: string,
): Promise<{ ok: true; eventId: string } | { ok: false }> {
  const existing = await findStudyReminderEvent(admin, userId, dateKey)
  if (!existing.ok) return { ok: false }
  if (existing.eventId) return { ok: true, eventId: existing.eventId }

  const { data: inserted, error: insertError } = await admin
    .from('notification_events')
    .insert({
      user_id: userId,
      notification_type: 'study_reminder',
      idempotency_key: dateKey,
      title: STUDY_REMINDER_PUSH_TITLE,
      body: STUDY_REMINDER_PUSH_BODY,
      target_path: STUDY_REMINDER_PUSH_PATH,
      metadata: {},
    })
    .select('id')
    .single<{ id: string }>()

  if (insertError) {
    if (insertError.code === '23505') {
      const raced = await findStudyReminderEvent(admin, userId, dateKey)
      if (!raced.ok || !raced.eventId) return { ok: false }
      return { ok: true, eventId: raced.eventId }
    }
    return { ok: false }
  }

  if (!inserted) return { ok: false }
  return { ok: true, eventId: inserted.id }
}

async function listDeliveries(
  admin: AdminClient,
  eventId: string,
): Promise<{ ok: true; rows: DeliveryRow[] } | { ok: false }> {
  const { data, error } = await admin
    .from('notification_deliveries')
    .select('id, channel, status, sent_at, created_at')
    .eq('event_id', eventId)

  if (error) return { ok: false }
  return { ok: true, rows: (data ?? []) as DeliveryRow[] }
}

function pendingAgeMs(row: DeliveryRow, nowMs: number): number {
  const anchor = row.sent_at ?? row.created_at
  const t = new Date(anchor).getTime()
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY
  return nowMs - t
}

async function markDeliveriesFailed(
  admin: AdminClient,
  ids: string[],
  errorCode: string,
): Promise<boolean> {
  if (ids.length === 0) return true
  const { error } = await admin
    .from('notification_deliveries')
    .update({
      status: 'failed',
      error_code: errorCode,
      succeeded_at: null,
    })
    .in('id', ids)

  return !error
}

/**
 * Inspect existing deliveries. May mark stale pendings as failed (no auto-resend).
 */
export function classifyExistingDeliveries(
  rows: DeliveryRow[],
  nowMs: number,
  staleMs: number = STUDY_REMINDER_PENDING_STALE_MS,
): {
  gate:
    | 'proceed'
    | 'already_completed'
    | 'in_progress'
    | 'stale_pending'
    | 'email_terminal'
  stalePendingIds: string[]
  hasPushSent: boolean
  hasEmailSent: boolean
  hasEmailFailed: boolean
  hasFailedPushOnly: boolean
} {
  const pending = rows.filter((r) => r.status === 'pending')
  const freshPending = pending.filter((r) => pendingAgeMs(r, nowMs) < staleMs)
  const stalePending = pending.filter((r) => pendingAgeMs(r, nowMs) >= staleMs)

  const hasPushSent = rows.some((r) => r.channel === 'push' && r.status === 'sent')
  const hasEmailSent = rows.some((r) => r.channel === 'email' && r.status === 'sent')
  const hasEmailFailed = rows.some((r) => r.channel === 'email' && r.status === 'failed')
  const hasFailedPushOnly =
    rows.some((r) => r.channel === 'push' && r.status === 'failed') && !hasPushSent

  if (hasPushSent || hasEmailSent) {
    return {
      gate: 'already_completed',
      stalePendingIds: stalePending.map((r) => r.id),
      hasPushSent,
      hasEmailSent,
      hasEmailFailed,
      hasFailedPushOnly,
    }
  }

  if (freshPending.length > 0) {
    return {
      gate: 'in_progress',
      stalePendingIds: [],
      hasPushSent,
      hasEmailSent,
      hasEmailFailed,
      hasFailedPushOnly,
    }
  }

  if (stalePending.length > 0) {
    return {
      gate: 'stale_pending',
      stalePendingIds: stalePending.map((r) => r.id),
      hasPushSent,
      hasEmailSent,
      hasEmailFailed,
      hasFailedPushOnly,
    }
  }

  if (hasEmailFailed) {
    return {
      gate: 'email_terminal',
      stalePendingIds: [],
      hasPushSent,
      hasEmailSent,
      hasEmailFailed,
      hasFailedPushOnly,
    }
  }

  return {
    gate: 'proceed',
    stalePendingIds: [],
    hasPushSent,
    hasEmailSent,
    hasEmailFailed,
    hasFailedPushOnly,
  }
}

async function claimEmailDeliveryPending(
  admin: AdminClient,
  eventId: string,
): Promise<'claimed' | 'exists' | 'error'> {
  const { error } = await admin.from('notification_deliveries').insert({
    event_id: eventId,
    channel: 'email',
    subscription_id: null,
    status: 'pending',
    attempt_count: 1,
    sent_at: new Date().toISOString(),
  })

  if (!error) return 'claimed'
  if (error.code === '23505') return 'exists'
  return 'error'
}

async function finalizeEmailDelivery(
  admin: AdminClient,
  eventId: string,
  patch: {
    status: 'sent' | 'failed'
    http_status: number | null
    error_code: string | null
    succeeded_at: string | null
  },
): Promise<boolean> {
  const { data, error } = await admin
    .from('notification_deliveries')
    .update(patch)
    .eq('event_id', eventId)
    .eq('channel', 'email')
    .select('id')
    .maybeSingle<{ id: string }>()

  return !error && Boolean(data)
}

async function tryEmailFallback(params: {
  admin: AdminClient
  userId: string
  dateKey: string
  dateLabel: string
  email: string | null
}): Promise<StudyReminderNewPathOutcome> {
  const event = await getOrCreateStudyReminderEvent(
    params.admin,
    params.userId,
    params.dateKey,
  )
  if (!event.ok) return 'failed'

  if (!params.email) {
    // Undeliverable: no email address and push did not succeed.
    // Record a failed email delivery without a fabricated address.
    const claim = await claimEmailDeliveryPending(params.admin, event.eventId)
    if (claim === 'error') return 'failed'
    if (claim === 'exists') {
      const listed = await listDeliveries(params.admin, event.eventId)
      if (!listed.ok) return 'failed'
      const emailRow = listed.rows.find((r) => r.channel === 'email')
      if (emailRow?.status === 'sent') return 'already_completed'
      if (emailRow?.status === 'failed') return 'email_failed'
      if (emailRow?.status === 'pending') return 'in_progress'
      return 'undeliverable'
    }
    await finalizeEmailDelivery(params.admin, event.eventId, {
      status: 'failed',
      http_status: null,
      error_code: 'no_email',
      succeeded_at: null,
    })
    return 'undeliverable'
  }

  const claim = await claimEmailDeliveryPending(params.admin, event.eventId)
  if (claim === 'error') return 'failed'
  if (claim === 'exists') {
    // Another worker claimed or finished — do not send again.
    return 'already_completed'
  }

  const sendResult = await sendMissingStudyLogEmail({
    to: params.email,
    dateLabel: params.dateLabel,
  })

  if (sendResult.ok) {
    const finalized = await finalizeEmailDelivery(params.admin, event.eventId, {
      status: 'sent',
      http_status: sendResult.httpStatus ?? 200,
      error_code: null,
      succeeded_at: new Date().toISOString(),
    })
    return finalized ? 'email_sent' : 'failed'
  }

  if (sendResult.skipped) {
    await finalizeEmailDelivery(params.admin, event.eventId, {
      status: 'failed',
      http_status: null,
      error_code: 'email_not_configured',
      succeeded_at: null,
    })
    return 'email_failed'
  }

    await finalizeEmailDelivery(params.admin, event.eventId, {
      status: 'failed',
      http_status: sendResult.httpStatus ?? null,
      error_code: sendResult.errorClass ?? 'email_send_failed',
      succeeded_at: null,
    })
    return 'email_failed'
}

/**
 * Push-first path for one student. Never logs PII / endpoints / keys.
 */
export async function processStudyReminderNewPath(params: {
  candidate: StudyReminderCandidate
  dateKey: string
  dateLabel: string
  nowMs?: number
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<StudyReminderNewPathOutcome> {
  const admin = createAdminClient()
  if (!admin) return 'failed'

  const nowMs = params.nowMs ?? Date.now()
  const env = params.env ?? process.env

  const recorded = await hasStudyLogOnDate(
    admin,
    params.candidate.studentId,
    params.dateKey,
  )
  if (!recorded.ok) return 'failed'
  if (recorded.hasLog) return 'recorded_before_send'

  const pref = await getStudyReminderPreferenceEnabled(
    admin,
    params.candidate.studentId,
  )
  if (!pref.ok) return 'failed'
  if (!pref.enabled) return 'preference_disabled'

  if (isVercelNonProduction(env)) {
    return 'non_production_skip'
  }

  const existingEvent = await findStudyReminderEvent(
    admin,
    params.candidate.studentId,
    params.dateKey,
  )
  if (!existingEvent.ok) return 'failed'

  if (existingEvent.eventId) {
    const listed = await listDeliveries(admin, existingEvent.eventId)
    if (!listed.ok) return 'failed'

    const classified = classifyExistingDeliveries(listed.rows, nowMs)
    if (classified.gate === 'already_completed') return 'already_completed'
    if (classified.gate === 'in_progress') return 'in_progress'
    if (classified.gate === 'email_terminal') return 'email_failed'

    if (classified.gate === 'stale_pending') {
      const marked = await markDeliveriesFailed(
        admin,
        classified.stalePendingIds,
        'stale_pending',
      )
      if (!marked) return 'failed'
      // No auto-resend after stale resolution.
      return 'stale_pending'
    }

    // proceed: may have failed pushes only — skip push retry, go email if needed
    if (classified.hasFailedPushOnly) {
      return tryEmailFallback({
        admin,
        userId: params.candidate.studentId,
        dateKey: params.dateKey,
        dateLabel: params.dateLabel,
        email: params.candidate.email,
      })
    }
  }

  // Attempt Push when sending is available; otherwise fall through to email.
  if (isPushSendingAvailable(env)) {
    const pushResult = await sendPushNotification({
      userId: params.candidate.studentId,
      notificationType: 'study_reminder',
      idempotencyKey: params.dateKey,
      title: STUDY_REMINDER_PUSH_TITLE,
      body: STUDY_REMINDER_PUSH_BODY,
      targetPath: STUDY_REMINDER_PUSH_PATH,
      tag: `study-reminder-${params.dateKey}`,
    })

    if (pushResult.ok) {
      if (pushResult.sent > 0) return 'push_sent'
      // sent === 0: all failed or skipped without success → email fallback
    } else if (pushResult.code === 'preference_disabled') {
      return 'preference_disabled'
    } else if (pushResult.code === 'invalid_input' || pushResult.code === 'db_error') {
      return 'failed'
    } else if (pushResult.code === 'admin_unavailable') {
      return 'failed'
    }
    // disabled | not_configured | no_subscriptions → email fallback
  }

  return tryEmailFallback({
    admin,
    userId: params.candidate.studentId,
    dateKey: params.dateKey,
    dateLabel: params.dateLabel,
    email: params.candidate.email,
  })
}

/**
 * Dry-run classification for one candidate (no sends, no event writes).
 */
export async function classifyStudyReminderDryRun(params: {
  candidate: StudyReminderCandidate
  dateKey: string
}): Promise<
  | {
      ok: true
      bucket:
        | 'wouldUsePushFirst'
        | 'wouldFallbackToEmail'
        | 'preferenceDisabled'
        | 'noPushSubscription'
        | 'noEmail'
        | 'recordedBeforeSend'
        | 'failed'
    }
  | { ok: false }
> {
  const admin = createAdminClient()
  if (!admin) return { ok: false }

  const recorded = await hasStudyLogOnDate(
    admin,
    params.candidate.studentId,
    params.dateKey,
  )
  if (!recorded.ok) return { ok: true, bucket: 'failed' }
  if (recorded.hasLog) return { ok: true, bucket: 'recordedBeforeSend' }

  const pref = await getStudyReminderPreferenceEnabled(
    admin,
    params.candidate.studentId,
  )
  if (!pref.ok) return { ok: true, bucket: 'failed' }
  if (!pref.enabled) return { ok: true, bucket: 'preferenceDisabled' }

  const subs = await countActivePushSubscriptions(admin, params.candidate.studentId)
  if (!subs.ok) return { ok: true, bucket: 'failed' }

  if (subs.count > 0 && isPushSendingAvailable()) {
    return { ok: true, bucket: 'wouldUsePushFirst' }
  }

  if (subs.count === 0) {
    if (!params.candidate.email) {
      return { ok: true, bucket: 'noEmail' }
    }
    return { ok: true, bucket: 'noPushSubscription' }
  }

  // Has subs but push sending unavailable → would fallback to email
  if (!params.candidate.email) {
    return { ok: true, bucket: 'noEmail' }
  }
  return { ok: true, bucket: 'wouldFallbackToEmail' }
}

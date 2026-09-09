import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushNotification } from '@/lib/push/send-service'
import { isPushSendingAvailable } from '@/lib/push/send-config'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/push'
import { isVercelNonProduction } from '@/lib/study/study-reminder-mode'
import { classifyExistingDeliveries } from '@/lib/study/study-reminder-new-path'
import { COACHING_REMINDER_PENDING_STALE_MS } from '@/lib/coaching/coaching-reminder-mode'
import {
  COACHING_REMINDER_PUSH_PATH,
  COACHING_REMINDER_PUSH_TITLE,
  sendAdminRescheduleEmail,
  sendBookingPromptEmail,
  sendSessionPreviousDayEmail,
} from '@/lib/coaching/coaching-reminder-email'

export type CoachingReminderKind =
  | 'booking_prompt'
  | 'session_previous_day'
  | 'admin_reschedule'

export type CoachingReminderNewPathOutcome =
  | 'push_sent'
  | 'email_sent'
  | 'preference_disabled'
  | 'already_completed'
  | 'in_progress'
  | 'stale_pending'
  | 'email_failed'
  | 'undeliverable'
  | 'non_production_skip'
  | 'timed_out'
  | 'failed'

type DeliveryRow = {
  id: string
  channel: 'push' | 'email'
  status: 'pending' | 'sent' | 'failed' | 'skipped'
  sent_at: string | null
  created_at: string
}

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

export async function getCoachingReminderPreferenceEnabled(
  admin: AdminClient,
  userId: string,
): Promise<{ ok: true; enabled: boolean } | { ok: false }> {
  const { data, error } = await admin
    .from('notification_preferences')
    .select('coaching_reminder')
    .eq('user_id', userId)
    .maybeSingle<{ coaching_reminder: boolean }>()

  if (error) return { ok: false }
  if (!data) {
    return { ok: true, enabled: DEFAULT_NOTIFICATION_PREFERENCES.coaching_reminder }
  }
  return { ok: true, enabled: Boolean(data.coaching_reminder) }
}

async function findEvent(
  admin: AdminClient,
  userId: string,
  idempotencyKey: string,
): Promise<{ ok: true; eventId: string | null } | { ok: false }> {
  const { data, error } = await admin
    .from('notification_events')
    .select('id')
    .eq('user_id', userId)
    .eq('notification_type', 'coaching_reminder')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle<{ id: string }>()

  if (error) return { ok: false }
  return { ok: true, eventId: data?.id ?? null }
}

async function getOrCreateEvent(
  admin: AdminClient,
  params: {
    userId: string
    idempotencyKey: string
    title: string
    body: string
    kind: CoachingReminderKind
    eventMetadata?: Record<string, unknown>
  },
): Promise<{ ok: true; eventId: string } | { ok: false }> {
  const existing = await findEvent(admin, params.userId, params.idempotencyKey)
  if (!existing.ok) return { ok: false }
  if (existing.eventId) return { ok: true, eventId: existing.eventId }

  const metadata = {
    kind: params.kind,
    ...(params.eventMetadata ?? {}),
  }

  const { data: inserted, error: insertError } = await admin
    .from('notification_events')
    .insert({
      user_id: params.userId,
      notification_type: 'coaching_reminder',
      idempotency_key: params.idempotencyKey,
      title: params.title,
      body: params.body,
      target_path: COACHING_REMINDER_PUSH_PATH,
      metadata,
    })
    .select('id')
    .single<{ id: string }>()

  if (insertError) {
    if (insertError.code === '23505') {
      const raced = await findEvent(admin, params.userId, params.idempotencyKey)
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
  idempotencyKey: string
  kind: CoachingReminderKind
  title: string
  body: string
  email: string | null
  hm?: string
  coachName?: string
  datetimeLabel?: string
  deadlineMs?: number
  eventMetadata?: Record<string, unknown>
}): Promise<CoachingReminderNewPathOutcome> {
  if (params.deadlineMs != null && Date.now() >= params.deadlineMs) {
    return 'timed_out'
  }

  const event = await getOrCreateEvent(params.admin, {
    userId: params.userId,
    idempotencyKey: params.idempotencyKey,
    title: params.title,
    body: params.body,
    kind: params.kind,
    eventMetadata: params.eventMetadata,
  })
  if (!event.ok) return 'failed'

  if (!params.email) {
    const claim = await claimEmailDeliveryPending(params.admin, event.eventId)
    if (claim === 'error') return 'failed'
    if (claim === 'exists') return 'already_completed'
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
  if (claim === 'exists') return 'already_completed'

  const sendResult =
    params.kind === 'booking_prompt'
      ? await sendBookingPromptEmail({
          to: params.email,
          deadlineMs: params.deadlineMs,
        })
      : params.kind === 'admin_reschedule'
        ? await sendAdminRescheduleEmail({
            to: params.email,
            coachName: params.coachName ?? '担当講師',
            datetimeLabel: params.datetimeLabel ?? '',
            deadlineMs: params.deadlineMs,
          })
        : await sendSessionPreviousDayEmail({
            to: params.email,
            hm: params.hm ?? '00:00',
            deadlineMs: params.deadlineMs,
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

  if (!sendResult.ok && sendResult.errorClass === 'deadline') {
    await finalizeEmailDelivery(params.admin, event.eventId, {
      status: 'failed',
      http_status: null,
      error_code: 'deadline',
      succeeded_at: null,
    })
    return 'timed_out'
  }

  await finalizeEmailDelivery(params.admin, event.eventId, {
    status: 'failed',
    http_status: sendResult.httpStatus ?? null,
    error_code: sendResult.skipped
      ? 'email_not_configured'
      : (sendResult.errorClass ?? 'email_send_failed'),
    succeeded_at: null,
  })
  return 'email_failed'
}

/**
 * Push-first coaching_reminder path. Never logs PII / booking ids / emails.
 * Cron passes weekly/session keys; admin integration tests pass distinct keys + eventMetadata.
 */
export async function processCoachingReminderNewPath(params: {
  studentUserId: string
  email: string | null
  idempotencyKey: string
  kind: CoachingReminderKind
  pushBody: string
  /** For session email body time; omit for booking prompt. */
  hm?: string
  /** For admin reschedule email body. */
  coachName?: string
  datetimeLabel?: string
  tag: string
  /** Merged into event metadata (admin tests override `kind` for ops distinction). */
  eventMetadata?: Record<string, unknown>
  nowMs?: number
  deadlineMs?: number
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<CoachingReminderNewPathOutcome> {
  const admin = createAdminClient()
  if (!admin) return 'failed'

  const nowMs = params.nowMs ?? Date.now()
  const env = params.env ?? process.env
  const eventMetadata = params.eventMetadata ?? {}

  if (params.deadlineMs != null && Date.now() >= params.deadlineMs) {
    return 'timed_out'
  }

  const pref = await getCoachingReminderPreferenceEnabled(admin, params.studentUserId)
  if (!pref.ok) return 'failed'
  if (!pref.enabled) return 'preference_disabled'

  if (isVercelNonProduction(env)) {
    return 'non_production_skip'
  }

  const existingEvent = await findEvent(admin, params.studentUserId, params.idempotencyKey)
  if (!existingEvent.ok) return 'failed'

  if (existingEvent.eventId) {
    const listed = await listDeliveries(admin, existingEvent.eventId)
    if (!listed.ok) return 'failed'

    const classified = classifyExistingDeliveries(
      listed.rows,
      nowMs,
      COACHING_REMINDER_PENDING_STALE_MS,
    )
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
      return 'stale_pending'
    }

    if (classified.hasFailedPushOnly) {
      return tryEmailFallback({
        admin,
        userId: params.studentUserId,
        idempotencyKey: params.idempotencyKey,
        kind: params.kind,
        title: COACHING_REMINDER_PUSH_TITLE,
        body: params.pushBody,
        email: params.email,
        hm: params.hm,
        coachName: params.coachName,
        datetimeLabel: params.datetimeLabel,
        deadlineMs: params.deadlineMs,
        eventMetadata,
      })
    }
  }

  if (isPushSendingAvailable(env)) {
    const pushResult = await sendPushNotification({
      userId: params.studentUserId,
      notificationType: 'coaching_reminder',
      idempotencyKey: params.idempotencyKey,
      title: COACHING_REMINDER_PUSH_TITLE,
      body: params.pushBody,
      targetPath: COACHING_REMINDER_PUSH_PATH,
      tag: params.tag,
    })

    if (pushResult.ok) {
      if (Object.keys(eventMetadata).length > 0) {
        await admin
          .from('notification_events')
          .update({
            metadata: {
              kind: params.kind,
              ...eventMetadata,
            },
          })
          .eq('id', pushResult.eventId)
      }
      if (pushResult.sent > 0) return 'push_sent'
    } else if (pushResult.code === 'preference_disabled') {
      return 'preference_disabled'
    } else if (
      pushResult.code === 'invalid_input' ||
      pushResult.code === 'db_error' ||
      pushResult.code === 'admin_unavailable'
    ) {
      return 'failed'
    }
  }

  return tryEmailFallback({
    admin,
    userId: params.studentUserId,
    idempotencyKey: params.idempotencyKey,
    kind: params.kind,
    title: COACHING_REMINDER_PUSH_TITLE,
    body: params.pushBody,
    email: params.email,
    hm: params.hm,
    coachName: params.coachName,
    datetimeLabel: params.datetimeLabel,
    deadlineMs: params.deadlineMs,
    eventMetadata,
  })
}

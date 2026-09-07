import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushNotification } from '@/lib/push/send-service'
import { isPushSendingAvailable } from '@/lib/push/send-config'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/push'
import { isVercelNonProduction } from '@/lib/study/study-reminder-mode'
import { classifyExistingDeliveries } from '@/lib/study/study-reminder-new-path'
import { CLASS_SCHEDULE_PENDING_STALE_MS } from '@/lib/class-schedule/class-schedule-delivery-mode'
import {
  CLASS_SCHEDULE_PUSH_PATH,
  CLASS_SCHEDULE_PUSH_TITLE,
  classScheduleIdempotencyKey,
  classSchedulePushBodyForKind,
  sendClassScheduleFallbackEmail,
  type ClassScheduleNotifyKind,
} from '@/lib/class-schedule/class-schedule-email'

export type ClassScheduleNewPathOutcome =
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

export type ClassScheduleCandidate = {
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

export async function getClassSchedulePreferenceEnabled(
  admin: AdminClient,
  userId: string,
): Promise<{ ok: true; enabled: boolean } | { ok: false }> {
  const { data, error } = await admin
    .from('notification_preferences')
    .select('class_schedule')
    .eq('user_id', userId)
    .maybeSingle<{ class_schedule: boolean }>()

  if (error) return { ok: false }
  if (!data) return { ok: true, enabled: DEFAULT_NOTIFICATION_PREFERENCES.class_schedule }
  return { ok: true, enabled: Boolean(data.class_schedule) }
}

async function findClassScheduleEvent(
  admin: AdminClient,
  userId: string,
  idempotencyKey: string,
): Promise<{ ok: true; eventId: string | null } | { ok: false }> {
  const { data, error } = await admin
    .from('notification_events')
    .select('id')
    .eq('user_id', userId)
    .eq('notification_type', 'class_schedule')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle<{ id: string }>()

  if (error) return { ok: false }
  return { ok: true, eventId: data?.id ?? null }
}

async function getOrCreateClassScheduleEvent(
  admin: AdminClient,
  userId: string,
  idempotencyKey: string,
  kind: ClassScheduleNotifyKind,
): Promise<{ ok: true; eventId: string } | { ok: false }> {
  const existing = await findClassScheduleEvent(admin, userId, idempotencyKey)
  if (!existing.ok) return { ok: false }
  if (existing.eventId) return { ok: true, eventId: existing.eventId }

  const body = classSchedulePushBodyForKind(kind)
  const { data: inserted, error: insertError } = await admin
    .from('notification_events')
    .insert({
      user_id: userId,
      notification_type: 'class_schedule',
      idempotency_key: idempotencyKey,
      title: CLASS_SCHEDULE_PUSH_TITLE,
      body,
      target_path: CLASS_SCHEDULE_PUSH_PATH,
      metadata: { kind },
    })
    .select('id')
    .single<{ id: string }>()

  if (insertError) {
    if (insertError.code === '23505') {
      const raced = await findClassScheduleEvent(admin, userId, idempotencyKey)
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
  dayId: string
  notifyRevision: number
  kind: ClassScheduleNotifyKind
  email: string | null
  deadlineMs?: number
}): Promise<ClassScheduleNewPathOutcome> {
  if (params.deadlineMs != null && Date.now() >= params.deadlineMs) {
    return 'timed_out'
  }

  const idempotencyKey = classScheduleIdempotencyKey({
    dayId: params.dayId,
    notifyRevision: params.notifyRevision,
    kind: params.kind,
  })
  const event = await getOrCreateClassScheduleEvent(
    params.admin,
    params.userId,
    idempotencyKey,
    params.kind,
  )
  if (!event.ok) return 'failed'

  if (!params.email) {
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
    return 'already_completed'
  }

  const sendResult = await sendClassScheduleFallbackEmail({
    to: params.email,
    kind: params.kind,
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
 * Prefer no event when preference is disabled.
 * metadata must NOT include venue/address/subject/times.
 */
export async function processClassScheduleNewPath(params: {
  candidate: ClassScheduleCandidate
  dayId: string
  notifyRevision: number
  kind: ClassScheduleNotifyKind
  nowMs?: number
  deadlineMs?: number
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<ClassScheduleNewPathOutcome> {
  const admin = createAdminClient()
  if (!admin) return 'failed'

  const nowMs = params.nowMs ?? Date.now()
  const env = params.env ?? process.env
  const body = classSchedulePushBodyForKind(params.kind)
  const idempotencyKey = classScheduleIdempotencyKey({
    dayId: params.dayId,
    notifyRevision: params.notifyRevision,
    kind: params.kind,
  })

  if (params.deadlineMs != null && Date.now() >= params.deadlineMs) {
    return 'timed_out'
  }

  const pref = await getClassSchedulePreferenceEnabled(admin, params.candidate.studentId)
  if (!pref.ok) return 'failed'
  if (!pref.enabled) return 'preference_disabled'

  if (isVercelNonProduction(env)) {
    return 'non_production_skip'
  }

  const existingEvent = await findClassScheduleEvent(
    admin,
    params.candidate.studentId,
    idempotencyKey,
  )
  if (!existingEvent.ok) return 'failed'

  if (existingEvent.eventId) {
    const listed = await listDeliveries(admin, existingEvent.eventId)
    if (!listed.ok) return 'failed'

    const classified = classifyExistingDeliveries(
      listed.rows,
      nowMs,
      CLASS_SCHEDULE_PENDING_STALE_MS,
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
        userId: params.candidate.studentId,
        dayId: params.dayId,
        notifyRevision: params.notifyRevision,
        kind: params.kind,
        email: params.candidate.email,
        deadlineMs: params.deadlineMs,
      })
    }
  }

  if (isPushSendingAvailable(env)) {
    const pushResult = await sendPushNotification({
      userId: params.candidate.studentId,
      notificationType: 'class_schedule',
      idempotencyKey,
      title: CLASS_SCHEDULE_PUSH_TITLE,
      body,
      targetPath: CLASS_SCHEDULE_PUSH_PATH,
      tag: `class-schedule-${params.dayId}-r${params.notifyRevision}`,
    })

    if (pushResult.ok) {
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
    userId: params.candidate.studentId,
    dayId: params.dayId,
    notifyRevision: params.notifyRevision,
    kind: params.kind,
    email: params.candidate.email,
    deadlineMs: params.deadlineMs,
  })
}

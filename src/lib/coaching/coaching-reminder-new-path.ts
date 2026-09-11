import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushNotification } from '@/lib/push/send-service'
import { isPushSendingAvailable } from '@/lib/push/send-config'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/push'
import { isVercelNonProduction } from '@/lib/study/study-reminder-mode'
import { classifyExistingDeliveries } from '@/lib/study/study-reminder-new-path'
import { COACHING_REMINDER_PENDING_STALE_MS } from '@/lib/coaching/coaching-reminder-mode'
import {
  acceptanceToAttemptStatus,
  canSafelyRetryUnknownWithResendIdempotency,
  classifyEmailSendAcceptance,
} from '@/lib/coaching/email-attempt-outcome'
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
  status: 'pending' | 'sent' | 'failed' | 'skipped' | 'unknown'
  sent_at: string | null
  created_at: string
}

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

type ClaimedEmailAttempt = {
  deliveryId: string
  attemptId: string
  claimToken: string
  attemptNo: number
}

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

/**
 * Claim a new email send attempt without erasing prior failure rows.
 * Concurrent retries: unique partial index allows only one pending attempt.
 *
 * Pre-061 failed deliveries: seed a synthetic attempt_no=1 from the delivery
 * row so existing error_code/http_status stay in history before retry.
 */
async function claimEmailDeliveryAttempt(
  admin: AdminClient,
  deliveryId: string,
): Promise<ClaimedEmailAttempt | null> {
  await seedLegacyAttemptHistoryIfNeeded(admin, deliveryId)

  const { data: latest, error: latestError } = await admin
    .from('notification_delivery_attempts')
    .select('attempt_no')
    .eq('delivery_id', deliveryId)
    .order('attempt_no', { ascending: false })
    .limit(1)
    .maybeSingle<{ attempt_no: number }>()

  if (latestError) return null
  const nextNo = (latest?.attempt_no ?? 0) + 1
  const claimToken = crypto.randomUUID()

  const { data: inserted, error } = await admin
    .from('notification_delivery_attempts')
    .insert({
      delivery_id: deliveryId,
      attempt_no: nextNo,
      status: 'pending',
      claim_token: claimToken,
      started_at: new Date().toISOString(),
    })
    .select('id, claim_token, attempt_no')
    .maybeSingle<{ id: string; claim_token: string; attempt_no: number }>()

  if (error) {
    // Unique pending or race on attempt_no → another worker owns the send-right
    if (error.code === '23505') return null
    return null
  }
  if (!inserted) return null

  // Aggregate becomes pending; do not clear error_code (legacy visibility until finalize).
  await admin
    .from('notification_deliveries')
    .update({
      status: 'pending',
      sent_at: new Date().toISOString(),
      attempt_count: nextNo,
    })
    .eq('id', deliveryId)
    .neq('status', 'sent')

  return {
    deliveryId,
    attemptId: inserted.id,
    claimToken: inserted.claim_token,
    attemptNo: inserted.attempt_no,
  }
}

async function seedLegacyAttemptHistoryIfNeeded(
  admin: AdminClient,
  deliveryId: string,
): Promise<void> {
  const { count, error: countError } = await admin
    .from('notification_delivery_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('delivery_id', deliveryId)
  if (countError || (count ?? 0) > 0) return

  const { data: delivery } = await admin
    .from('notification_deliveries')
    .select('status, error_code, http_status, created_at, sent_at')
    .eq('id', deliveryId)
    .maybeSingle<{
      status: string
      error_code: string | null
      http_status: number | null
      created_at: string
      sent_at: string | null
    }>()

  if (!delivery) return
  if (delivery.status !== 'failed' && delivery.status !== 'unknown') return

  const finishedAt = delivery.sent_at ?? delivery.created_at
  await admin.from('notification_delivery_attempts').insert({
    delivery_id: deliveryId,
    attempt_no: 1,
    status: delivery.status === 'unknown' ? 'unknown' : 'failed',
    acceptance: delivery.status === 'unknown' ? 'unknown' : 'not_accepted',
    http_status: delivery.http_status,
    error_code: delivery.error_code,
    started_at: finishedAt,
    finished_at: finishedAt,
  })
}

async function findEmailDeliveryId(
  admin: AdminClient,
  eventId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('notification_deliveries')
    .select('id')
    .eq('event_id', eventId)
    .eq('channel', 'email')
    .maybeSingle<{ id: string }>()
  if (error) return null
  return data?.id ?? null
}

async function finalizeEmailAttempt(
  admin: AdminClient,
  claim: ClaimedEmailAttempt,
  patch: {
    status: 'sent' | 'failed' | 'unknown'
    acceptance: 'not_accepted' | 'accepted' | 'unknown'
    httpStatus: number | null
    errorCode: string | null
    providerMessageId?: string | null
  },
): Promise<boolean> {
  const finishedAt = new Date().toISOString()
  const { data, error } = await admin
    .from('notification_delivery_attempts')
    .update({
      status: patch.status,
      acceptance: patch.acceptance,
      http_status: patch.httpStatus,
      error_code: patch.errorCode,
      provider_message_id: patch.providerMessageId ?? null,
      finished_at: finishedAt,
    })
    .eq('id', claim.attemptId)
    .eq('claim_token', claim.claimToken)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error || !data) return false

  const deliveryStatus =
    patch.status === 'sent'
      ? 'sent'
      : patch.status === 'unknown'
        ? 'unknown'
        : 'failed'

  // Attempt CAS already won; still never let a late failed/unknown overwrite sent.
  let deliveryQuery = admin
    .from('notification_deliveries')
    .update({
      status: deliveryStatus,
      http_status: patch.httpStatus,
      // Keep latest summary code only; full history lives on attempts rows.
      error_code: patch.errorCode,
      succeeded_at: patch.status === 'sent' ? finishedAt : null,
      attempt_count: claim.attemptNo,
    })
    .eq('id', claim.deliveryId)

  if (patch.status === 'sent') {
    deliveryQuery = deliveryQuery.in('status', ['pending', 'failed', 'unknown'])
  } else {
    deliveryQuery = deliveryQuery.neq('status', 'sent')
  }

  const { error: deliveryError } = await deliveryQuery

  return !deliveryError
}

async function firstAttemptStartedAtMs(
  admin: AdminClient,
  deliveryId: string,
): Promise<number | null> {
  const { data, error } = await admin
    .from('notification_delivery_attempts')
    .select('started_at')
    .eq('delivery_id', deliveryId)
    .order('attempt_no', { ascending: true })
    .limit(1)
    .maybeSingle<{ started_at: string }>()
  if (error || !data?.started_at) return null
  return Date.parse(data.started_at)
}

/**
 * Admin reschedule email retry: preserve failed history via attempt rows;
 * only the claim holder finalizes that attempt.
 */
async function retryAdminRescheduleEmailWithHistory(params: {
  admin: AdminClient
  eventId: string
  email: string | null
  idempotencyKey: string
  coachName?: string
  datetimeLabel?: string
  deadlineMs?: number
  nowMs: number
  deliveryStatus: 'failed' | 'unknown'
}): Promise<CoachingReminderNewPathOutcome> {
  const deliveryId = await findEmailDeliveryId(params.admin, params.eventId)
  if (!deliveryId) return 'failed'

  if (params.deliveryStatus === 'unknown') {
    const firstStarted = await firstAttemptStartedAtMs(params.admin, deliveryId)
    if (
      firstStarted == null ||
      !canSafelyRetryUnknownWithResendIdempotency({
        firstAttemptStartedAtMs: firstStarted,
        nowMs: params.nowMs,
      })
    ) {
      // Outside Resend 24h window (or no attempt history): do not auto-resend.
      return 'email_failed'
    }
  }

  const claim = await claimEmailDeliveryAttempt(params.admin, deliveryId)
  if (!claim) return 'in_progress'

  if (!params.email) {
    await finalizeEmailAttempt(params.admin, claim, {
      status: 'failed',
      acceptance: 'not_accepted',
      httpStatus: null,
      errorCode: 'no_email',
    })
    return 'undeliverable'
  }

  const sendResult = await sendAdminRescheduleEmail({
    to: params.email,
    coachName: params.coachName ?? '担当講師',
    datetimeLabel: params.datetimeLabel ?? '',
    deadlineMs: params.deadlineMs,
    // Same notification → same Resend key + same body (24h retention).
    idempotencyKey: params.idempotencyKey,
  })

  const acceptance = classifyEmailSendAcceptance({
    ok: sendResult.ok,
    errorClass: sendResult.ok ? null : sendResult.errorClass,
    httpStatus: sendResult.ok ? sendResult.httpStatus ?? 200 : sendResult.httpStatus,
    skipped: sendResult.ok ? false : sendResult.skipped,
  })
  const attemptStatus = acceptanceToAttemptStatus(acceptance)

  if (sendResult.ok) {
    const finalized = await finalizeEmailAttempt(params.admin, claim, {
      status: 'sent',
      acceptance: 'accepted',
      httpStatus: sendResult.httpStatus ?? 200,
      errorCode: null,
      providerMessageId: sendResult.providerMessageId,
    })
    // Provider accepted; if aggregate persist fails, attempt row still records sent.
    return finalized ? 'email_sent' : 'email_sent'
  }

  if (!sendResult.ok && sendResult.errorClass === 'deadline') {
    await finalizeEmailAttempt(params.admin, claim, {
      status: 'failed',
      acceptance: 'not_accepted',
      httpStatus: null,
      errorCode: 'deadline',
    })
    return 'timed_out'
  }

  // Payload mismatch (409 invalid_idempotent_request): investigate; never mint a new key.
  if (!sendResult.ok && sendResult.errorClass === 'idempotency_payload_mismatch') {
    await finalizeEmailAttempt(params.admin, claim, {
      status: 'failed',
      acceptance: 'not_accepted',
      httpStatus: sendResult.httpStatus ?? 409,
      errorCode: 'idempotency_payload_mismatch',
    })
    return 'email_failed'
  }

  // concurrent_idempotent_requests (or undifferentiated 409): treat as in-flight.
  if (
    !sendResult.ok &&
    (sendResult.errorClass === 'idempotency_concurrent' ||
      sendResult.errorClass === 'idempotency_conflict')
  ) {
    await finalizeEmailAttempt(params.admin, claim, {
      status: 'unknown',
      acceptance: 'unknown',
      httpStatus: sendResult.httpStatus ?? 409,
      errorCode: sendResult.errorClass,
    })
    return 'in_progress'
  }

  await finalizeEmailAttempt(params.admin, claim, {
    status: attemptStatus,
    acceptance,
    httpStatus: sendResult.httpStatus ?? null,
    errorCode: sendResult.skipped
      ? 'email_not_configured'
      : (sendResult.errorClass ?? 'email_send_failed'),
  })

  if (acceptance === 'unknown') return 'failed'
  return 'email_failed'
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
    status: 'sent' | 'failed' | 'unknown'
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

/** After first-time email claim, also write attempt #1 for history. */
async function recordInitialEmailAttempt(
  admin: AdminClient,
  eventId: string,
  patch: {
    status: 'sent' | 'failed' | 'unknown'
    acceptance: 'not_accepted' | 'accepted' | 'unknown'
    httpStatus: number | null
    errorCode: string | null
    providerMessageId?: string | null
  },
): Promise<void> {
  const deliveryId = await findEmailDeliveryId(admin, eventId)
  if (!deliveryId) return
  await admin.from('notification_delivery_attempts').insert({
    delivery_id: deliveryId,
    attempt_no: 1,
    status: patch.status,
    acceptance: patch.acceptance,
    http_status: patch.httpStatus,
    error_code: patch.errorCode,
    provider_message_id: patch.providerMessageId ?? null,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  })
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
            idempotencyKey: params.idempotencyKey,
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
    await recordInitialEmailAttempt(params.admin, event.eventId, {
      status: 'sent',
      acceptance: 'accepted',
      httpStatus: sendResult.httpStatus ?? 200,
      errorCode: null,
      providerMessageId: sendResult.providerMessageId,
    })
    return finalized ? 'email_sent' : 'email_sent'
  }

  const acceptance = classifyEmailSendAcceptance({
    ok: false,
    errorClass: sendResult.errorClass,
    httpStatus: sendResult.httpStatus,
    skipped: sendResult.skipped,
  })
  const attemptStatus = acceptanceToAttemptStatus(acceptance)

  if (!sendResult.ok && sendResult.errorClass === 'deadline') {
    await finalizeEmailDelivery(params.admin, event.eventId, {
      status: 'failed',
      http_status: null,
      error_code: 'deadline',
      succeeded_at: null,
    })
    await recordInitialEmailAttempt(params.admin, event.eventId, {
      status: 'failed',
      acceptance: 'not_accepted',
      httpStatus: null,
      errorCode: 'deadline',
    })
    return 'timed_out'
  }

  await finalizeEmailDelivery(params.admin, event.eventId, {
    status: attemptStatus === 'unknown' ? 'unknown' : 'failed',
    http_status: sendResult.httpStatus ?? null,
    error_code: sendResult.skipped
      ? 'email_not_configured'
      : (sendResult.errorClass ?? 'email_send_failed'),
    succeeded_at: null,
  })
  await recordInitialEmailAttempt(params.admin, event.eventId, {
    status: attemptStatus,
    acceptance,
    httpStatus: sendResult.httpStatus ?? null,
    errorCode: sendResult.skipped
      ? 'email_not_configured'
      : (sendResult.errorClass ?? 'email_send_failed'),
  })
  return acceptance === 'unknown' ? 'failed' : 'email_failed'
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

    let classified = classifyExistingDeliveries(
      listed.rows as Parameters<typeof classifyExistingDeliveries>[0],
      nowMs,
      COACHING_REMINDER_PENDING_STALE_MS,
    )

    if (classified.gate === 'already_completed') return 'already_completed'
    if (classified.gate === 'in_progress') return 'in_progress'

    // Push succeeded ⇒ never email (existing policy). already_completed covers this.
    const emailRow = listed.rows.find((r) => r.channel === 'email')
    if (emailRow?.status === 'unknown' && params.kind === 'admin_reschedule') {
      return retryAdminRescheduleEmailWithHistory({
        admin,
        eventId: existingEvent.eventId,
        email: params.email,
        idempotencyKey: params.idempotencyKey,
        coachName: params.coachName,
        datetimeLabel: params.datetimeLabel,
        deadlineMs: params.deadlineMs,
        nowMs,
        deliveryStatus: 'unknown',
      })
    }

    if (classified.gate === 'email_terminal') {
      // Cron must not loop on terminal email failure.
      if (params.kind !== 'admin_reschedule') return 'email_failed'
      return retryAdminRescheduleEmailWithHistory({
        admin,
        eventId: existingEvent.eventId,
        email: params.email,
        idempotencyKey: params.idempotencyKey,
        coachName: params.coachName,
        datetimeLabel: params.datetimeLabel,
        deadlineMs: params.deadlineMs,
        nowMs,
        deliveryStatus: 'failed',
      })
    }

    if (classified.gate === 'stale_pending') {
      // Do not assert success or unsent: mark aggregate/attempts as unknown.
      if (params.kind !== 'admin_reschedule') {
        const marked = await markDeliveriesFailed(
          admin,
          classified.stalePendingIds,
          'stale_pending',
        )
        if (!marked) return 'failed'
        return 'stale_pending'
      }

      for (const id of classified.stalePendingIds) {
        await admin
          .from('notification_deliveries')
          .update({
            status: 'unknown',
            error_code: 'stale_pending_unknown',
            succeeded_at: null,
          })
          .eq('id', id)
          .eq('status', 'pending')

        await admin
          .from('notification_delivery_attempts')
          .update({
            status: 'unknown',
            acceptance: 'unknown',
            error_code: 'stale_pending_unknown',
            finished_at: new Date().toISOString(),
          })
          .eq('delivery_id', id)
          .eq('status', 'pending')
      }

      return retryAdminRescheduleEmailWithHistory({
        admin,
        eventId: existingEvent.eventId,
        email: params.email,
        idempotencyKey: params.idempotencyKey,
        coachName: params.coachName,
        datetimeLabel: params.datetimeLabel,
        deadlineMs: params.deadlineMs,
        nowMs,
        deliveryStatus: 'unknown',
      })
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

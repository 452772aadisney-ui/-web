import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  MAX_PUSH_BODY_LENGTH,
  MAX_PUSH_TITLE_LENGTH,
  sanitizeDashboardPath,
  truncateText,
  type WebPushPayload,
} from '@/lib/push/notification-payload'
import { resolvePushSendConfig } from '@/lib/push/send-config'
import { classifyPushSendFailure } from '@/lib/push/send-errors'
import type { NotificationPreferenceCategory, PushNotificationType } from '@/types/push'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/push'

export type SendPushNotificationInput = {
  userId: string
  notificationType: PushNotificationType
  idempotencyKey: string
  title: string
  body: string
  targetPath: string
  /** When set, only these subscription IDs (owned by userId) are targeted. */
  subscriptionIds?: string[]
  tag?: string
}

export type SendPushNotificationResult =
  | {
      ok: true
      eventCreated: boolean
      eventId: string
      sent: number
      failed: number
      skipped: number
    }
  | {
      ok: false
      code:
        | 'disabled'
        | 'not_configured'
        | 'invalid_input'
        | 'preference_disabled'
        | 'no_subscriptions'
        | 'admin_unavailable'
        | 'db_error'
    }

type ActiveSubscription = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  failure_count: number
}

type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped'

const PREFERENCE_BY_TYPE: Partial<
  Record<PushNotificationType, NotificationPreferenceCategory>
> = {
  study_reminder: 'study_reminder',
  announcement: 'announcement',
  message: 'message',
  coaching_reminder: 'coaching_reminder',
}

function buildPayload(input: SendPushNotificationInput): WebPushPayload {
  return {
    title: truncateText(input.title, MAX_PUSH_TITLE_LENGTH) || '受験生web',
    body: truncateText(input.body, MAX_PUSH_BODY_LENGTH) || '新しいお知らせがあります',
    targetPath: sanitizeDashboardPath(input.targetPath),
    ...(input.tag ? { tag: input.tag } : {}),
    notificationType: input.notificationType,
  }
}

async function isCategoryEnabled(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
  notificationType: PushNotificationType,
): Promise<boolean> {
  if (notificationType === 'test') return true

  const category = PREFERENCE_BY_TYPE[notificationType]
  if (!category) return false

  const { data, error } = await admin
    .from('notification_preferences')
    .select('study_reminder, announcement, message, coaching_reminder')
    .eq('user_id', userId)
    .maybeSingle<Record<NotificationPreferenceCategory, boolean>>()

  if (error) {
    throw new Error('preference_lookup_failed')
  }

  if (!data) {
    return DEFAULT_NOTIFICATION_PREFERENCES[category]
  }

  return Boolean(data[category])
}

async function loadActiveSubscriptions(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
  subscriptionIds?: string[],
): Promise<ActiveSubscription[]> {
  let query = admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, failure_count')
    .eq('user_id', userId)
    .is('disabled_at', null)

  if (subscriptionIds && subscriptionIds.length > 0) {
    query = query.in('id', subscriptionIds)
  }

  const { data, error } = await query
  if (error) throw new Error('subscription_lookup_failed')
  return (data ?? []) as ActiveSubscription[]
}

async function getOrCreateEvent(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  input: SendPushNotificationInput,
  payload: WebPushPayload,
): Promise<{ eventId: string; created: boolean }> {
  const { data: existing, error: selectError } = await admin
    .from('notification_events')
    .select('id')
    .eq('user_id', input.userId)
    .eq('notification_type', input.notificationType)
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle<{ id: string }>()

  if (selectError) throw new Error('event_lookup_failed')
  if (existing) return { eventId: existing.id, created: false }

  const { data: inserted, error: insertError } = await admin
    .from('notification_events')
    .insert({
      user_id: input.userId,
      notification_type: input.notificationType,
      idempotency_key: input.idempotencyKey,
      title: payload.title,
      body: payload.body,
      target_path: payload.targetPath,
      metadata: {},
    })
    .select('id')
    .single<{ id: string }>()

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: raced, error: raceError } = await admin
        .from('notification_events')
        .select('id')
        .eq('user_id', input.userId)
        .eq('notification_type', input.notificationType)
        .eq('idempotency_key', input.idempotencyKey)
        .maybeSingle<{ id: string }>()
      if (raceError || !raced) throw new Error('event_race_failed')
      return { eventId: raced.id, created: false }
    }
    throw new Error('event_insert_failed')
  }

  if (!inserted) throw new Error('event_insert_failed')
  return { eventId: inserted.id, created: true }
}

async function getExistingDeliveryStatus(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  eventId: string,
  subscriptionId: string,
): Promise<DeliveryStatus | null> {
  const { data, error } = await admin
    .from('notification_deliveries')
    .select('status')
    .eq('event_id', eventId)
    .eq('subscription_id', subscriptionId)
    .maybeSingle<{ status: DeliveryStatus }>()

  if (error) throw new Error('delivery_lookup_failed')
  return data?.status ?? null
}

async function claimDeliveryPending(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  eventId: string,
  subscriptionId: string,
): Promise<'claimed' | 'exists'> {
  const { error } = await admin.from('notification_deliveries').insert({
    event_id: eventId,
    channel: 'push',
    subscription_id: subscriptionId,
    status: 'pending',
    attempt_count: 1,
    sent_at: new Date().toISOString(),
  })

  if (!error) return 'claimed'
  if (error.code === '23505') return 'exists'
  throw new Error('delivery_insert_failed')
}

async function finalizeDelivery(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  eventId: string,
  subscriptionId: string,
  patch: {
    status: 'sent' | 'failed'
    http_status: number | null
    error_code: string | null
    succeeded_at: string | null
  },
): Promise<void> {
  const { data, error } = await admin
    .from('notification_deliveries')
    .update(patch)
    .eq('event_id', eventId)
    .eq('subscription_id', subscriptionId)
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error || !data) {
    throw new Error('delivery_update_failed')
  }
}

async function markSubscriptionSuccess(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  subscriptionId: string,
): Promise<void> {
  await admin
    .from('push_subscriptions')
    .update({
      last_success_at: new Date().toISOString(),
      failure_count: 0,
      last_failure_at: null,
    })
    .eq('id', subscriptionId)
}

async function markSubscriptionFailure(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  subscription: ActiveSubscription,
  disable: boolean,
): Promise<void> {
  const patch: Record<string, unknown> = {
    last_failure_at: new Date().toISOString(),
    failure_count: subscription.failure_count + 1,
  }
  if (disable) {
    patch.disabled_at = new Date().toISOString()
  }
  await admin.from('push_subscriptions').update(patch).eq('id', subscription.id)
}

/**
 * Send a logical notification to the user's active Push subscriptions.
 * Never logs endpoints or keys. Skips DB writes when sending is disabled.
 *
 * Failed deliveries on the same event are NOT retried in this phase
 * (avoids surprise re-sends); a new event/idempotency key is required.
 */
export async function sendPushNotification(
  input: SendPushNotificationInput,
): Promise<SendPushNotificationResult> {
  const config = resolvePushSendConfig()
  if (!config.ok) {
    return {
      ok: false,
      code: config.reason === 'disabled' ? 'disabled' : 'not_configured',
    }
  }

  if (
    !input.userId ||
    !input.idempotencyKey.trim() ||
    !input.title.trim() ||
    !input.body.trim()
  ) {
    return { ok: false, code: 'invalid_input' }
  }

  const sanitizedPath = sanitizeDashboardPath(input.targetPath)
  const rawPath = input.targetPath.trim()
  if (
    sanitizedPath === '/dashboard' &&
    rawPath !== '/dashboard' &&
    !rawPath.startsWith('/dashboard/') &&
    !rawPath.startsWith('/dashboard?')
  ) {
    return { ok: false, code: 'invalid_input' }
  }

  const payload = buildPayload({ ...input, targetPath: sanitizedPath })
  const admin = createAdminClient()
  if (!admin) {
    return { ok: false, code: 'admin_unavailable' }
  }

  try {
    const allowed = await isCategoryEnabled(admin, input.userId, input.notificationType)
    if (!allowed) {
      return { ok: false, code: 'preference_disabled' }
    }

    const subscriptions = await loadActiveSubscriptions(
      admin,
      input.userId,
      input.subscriptionIds,
    )
    if (subscriptions.length === 0) {
      return { ok: false, code: 'no_subscriptions' }
    }

    const { eventId, created } = await getOrCreateEvent(admin, input, payload)

    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey)

    let sent = 0
    let failed = 0
    let skipped = 0

    // Bounded sequential sends (no unbounded parallelism).
    for (const subscription of subscriptions) {
      const existingStatus = await getExistingDeliveryStatus(admin, eventId, subscription.id)
      if (existingStatus === 'sent' || existingStatus === 'skipped') {
        skipped += 1
        continue
      }
      if (existingStatus === 'failed' || existingStatus === 'pending') {
        // This phase does not retry failed/pending rows on the same event.
        skipped += 1
        continue
      }

      const claim = await claimDeliveryPending(admin, eventId, subscription.id)
      if (claim === 'exists') {
        skipped += 1
        continue
      }

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(payload),
          {
            TTL: 60,
            urgency: 'normal',
            timeout: 10_000,
          },
        )

        await finalizeDelivery(admin, eventId, subscription.id, {
          status: 'sent',
          http_status: 201,
          error_code: null,
          succeeded_at: new Date().toISOString(),
        })
        await markSubscriptionSuccess(admin, subscription.id)
        sent += 1
      } catch (error) {
        const classified = classifyPushSendFailure(error)
        await finalizeDelivery(admin, eventId, subscription.id, {
          status: 'failed',
          http_status: classified.httpStatus,
          error_code: classified.errorCode,
          succeeded_at: null,
        })
        await markSubscriptionFailure(
          admin,
          subscription,
          classified.shouldDisableSubscription,
        )
        failed += 1
      }
    }

    return {
      ok: true,
      eventCreated: created,
      eventId,
      sent,
      failed,
      skipped,
    }
  } catch {
    return { ok: false, code: 'db_error' }
  }
}

export async function findActiveSubscriptionForUserKeys(params: {
  userId: string
  endpoint: string
  p256dh: string
  auth: string
}): Promise<{ ok: true; subscriptionId: string } | { ok: false; code: 'not_found' | 'admin_unavailable' | 'db_error' }> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', params.userId)
    .eq('endpoint', params.endpoint)
    .eq('p256dh', params.p256dh)
    .eq('auth', params.auth)
    .is('disabled_at', null)
    .maybeSingle<{ id: string }>()

  if (error) return { ok: false, code: 'db_error' }
  if (!data) return { ok: false, code: 'not_found' }
  return { ok: true, subscriptionId: data.id }
}

export async function getLatestTestNotificationAt(
  userId: string,
): Promise<{ ok: true; createdAt: string | null } | { ok: false }> {
  const admin = createAdminClient()
  if (!admin) return { ok: false }

  const { data, error } = await admin
    .from('notification_events')
    .select('created_at')
    .eq('user_id', userId)
    .eq('notification_type', 'test')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ created_at: string }>()

  if (error) return { ok: false }
  return { ok: true, createdAt: data?.created_at ?? null }
}

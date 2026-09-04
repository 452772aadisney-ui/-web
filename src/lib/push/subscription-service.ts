import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/push'
import type { PushSubscriptionInput } from '@/lib/push/subscription-input'
import { truncateUserAgent } from '@/lib/push/subscription-input'

export type SubscriptionStatusResult = {
  configured: boolean
  subscribed: boolean
}

export type SubscriptionWriteResult =
  | { ok: true; transferred?: boolean }
  | {
      ok: false
      code:
        | 'admin_unavailable'
        | 'conflict'
        | 'db_error'
    }

type SubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  disabled_at: string | null
}

async function ensureDefaultPreferences(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
): Promise<void> {
  const { data: existing } = await admin
    .from('notification_preferences')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle<{ user_id: string }>()

  if (existing) return

  const { error } = await admin.from('notification_preferences').insert({
    user_id: userId,
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  })

  // Unique race: another request created the row — ignore conflict.
  if (error && error.code !== '23505') {
    throw error
  }
}

/**
 * Idempotent upsert of the current browser subscription for `userId`.
 * Does not log endpoint or keys.
 *
 * Transfer rules:
 * - Same user → update / re-enable
 * - Other user + matching endpoint+p256dh+auth → transfer ownership
 * - Other user + key mismatch → conflict (do not overwrite)
 */
export async function upsertPushSubscriptionForUser(params: {
  userId: string
  subscription: PushSubscriptionInput
  userAgent: string | null
  _retry?: boolean
}): Promise<SubscriptionWriteResult> {
  const admin = createAdminClient()
  if (!admin) {
    return { ok: false, code: 'admin_unavailable' }
  }

  const { userId, subscription, userAgent, _retry = false } = params
  const ua = truncateUserAgent(userAgent)

  try {
    const { data: existing, error: selectError } = await admin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, disabled_at')
      .eq('endpoint', subscription.endpoint)
      .maybeSingle<SubscriptionRow>()

    if (selectError) {
      return { ok: false, code: 'db_error' }
    }

    if (!existing) {
      const { error: insertError } = await admin.from('push_subscriptions').insert({
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: ua,
        disabled_at: null,
        failure_count: 0,
        last_failure_at: null,
      })

      if (insertError) {
        // Race on unique endpoint — re-read once and apply transfer/update rules.
        if (insertError.code === '23505' && !_retry) {
          return upsertPushSubscriptionForUser({ ...params, _retry: true })
        }
        return { ok: false, code: 'db_error' }
      }

      await ensureDefaultPreferences(admin, userId)
      return { ok: true }
    }

    const keysMatch =
      existing.p256dh === subscription.keys.p256dh &&
      existing.auth === subscription.keys.auth

    if (existing.user_id !== userId) {
      if (!keysMatch) {
        // Same endpoint, different keys → do not steal or disable the other user.
        return { ok: false, code: 'conflict' }
      }

      const { error: transferError } = await admin
        .from('push_subscriptions')
        .update({
          user_id: userId,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          user_agent: ua,
          disabled_at: null,
          failure_count: 0,
          last_failure_at: null,
        })
        .eq('id', existing.id)
        .eq('endpoint', subscription.endpoint)
        .eq('p256dh', subscription.keys.p256dh)
        .eq('auth', subscription.keys.auth)

      if (transferError) {
        return { ok: false, code: 'db_error' }
      }

      await ensureDefaultPreferences(admin, userId)
      return { ok: true, transferred: true }
    }

    // Same user: re-enable and refresh keys (key rotation on same browser).
    const { error: updateError } = await admin
      .from('push_subscriptions')
      .update({
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: ua,
        disabled_at: null,
        failure_count: 0,
        last_failure_at: null,
      })
      .eq('id', existing.id)
      .eq('user_id', userId)

    if (updateError) {
      return { ok: false, code: 'db_error' }
    }

    await ensureDefaultPreferences(admin, userId)
    return { ok: true }
  } catch {
    return { ok: false, code: 'db_error' }
  }
}

/**
 * Soft-disable the current user's subscription matching endpoint + keys.
 * Idempotent when already disabled or not found for this user.
 */
export async function disablePushSubscriptionForUser(params: {
  userId: string
  subscription: PushSubscriptionInput
}): Promise<SubscriptionWriteResult> {
  const admin = createAdminClient()
  if (!admin) {
    return { ok: false, code: 'admin_unavailable' }
  }

  const { userId, subscription } = params

  try {
    const { data: existing, error: selectError } = await admin
      .from('push_subscriptions')
      .select('id, user_id, disabled_at')
      .eq('endpoint', subscription.endpoint)
      .eq('p256dh', subscription.keys.p256dh)
      .eq('auth', subscription.keys.auth)
      .maybeSingle<{ id: string; user_id: string; disabled_at: string | null }>()

    if (selectError) {
      return { ok: false, code: 'db_error' }
    }

    if (!existing || existing.user_id !== userId) {
      // Do not reveal whether another user owns the endpoint.
      return { ok: true }
    }

    if (existing.disabled_at) {
      return { ok: true }
    }

    const { error: updateError } = await admin
      .from('push_subscriptions')
      .update({ disabled_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('user_id', userId)

    if (updateError) {
      return { ok: false, code: 'db_error' }
    }

    return { ok: true }
  } catch {
    return { ok: false, code: 'db_error' }
  }
}

export async function getPushSubscriptionStatusForUser(params: {
  userId: string
  configured: boolean
}): Promise<SubscriptionStatusResult | { ok: false; code: 'admin_unavailable' | 'db_error' }> {
  const admin = createAdminClient()
  if (!admin) {
    return { ok: false, code: 'admin_unavailable' }
  }

  try {
    const { data, error } = await admin
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', params.userId)
      .is('disabled_at', null)
      .limit(1)

    if (error) {
      return { ok: false, code: 'db_error' }
    }

    return {
      configured: params.configured,
      subscribed: (data?.length ?? 0) > 0,
    }
  } catch {
    return { ok: false, code: 'db_error' }
  }
}

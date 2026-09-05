import { createAdminClient } from '@/lib/supabase/admin'
import { getPersonName } from '@/lib/auth/display-name'
import { isPushSendingAvailable } from '@/lib/push/send-config'
import { sendPushNotification } from '@/lib/push/send-service'
import { sendEmail } from '@/lib/email/send'
import { getAppBaseUrl } from '@/lib/email/config'
import { getJstDateKey } from '@/lib/study/dates'
import {
  countActivePushSubscriptions,
  getStudyReminderPreferenceEnabled,
  hasStudyLogOnDate,
} from '@/lib/study/study-reminder-new-path'
import { resolveEffectiveStudyReminderMode } from '@/lib/study/study-reminder-mode'
import {
  ADMIN_NOTIFICATION_TEST_COOLDOWN_MS,
  ADMIN_TEST_EMAIL_BODY,
  ADMIN_TEST_EMAIL_SUBJECT,
  ADMIN_TEST_PUSH_BODY,
  ADMIN_TEST_PUSH_PATH,
  ADMIN_TEST_PUSH_TITLE,
  buildAdminTestIdempotencyKey,
  resolveAdminNotificationTestAvailability,
} from '@/lib/admin/notification-test-config'

export type AdminTestTargetOption = {
  /** Needed for form selection; never log. */
  id: string
  label: string
}

export type AdminTestProjectedOutcome =
  | 'would_use_push'
  | 'would_fallback_email'
  | 'preference_disabled'
  | 'already_recorded'
  | 'undeliverable'

export type AdminTestInspectResult = {
  recordedToday: boolean
  preferenceEnabled: boolean
  preferenceRowExists: boolean
  hasActivePushSubscription: boolean
  canEmailFallback: boolean
  pushSendingEnabled: boolean
  deliveryMode: string
  projectedOutcome: AdminTestProjectedOutcome
  projectedOutcomeLabel: string
}

function projectedLabel(outcome: AdminTestProjectedOutcome): string {
  switch (outcome) {
    case 'would_use_push':
      return '現在の判定：Push対象'
    case 'would_fallback_email':
      return '現在の判定：メールfallback対象'
    case 'preference_disabled':
      return '現在の判定：通知設定OFFのため対象外'
    case 'already_recorded':
      return '現在の判定：本日の学習記録済みのため対象外'
    case 'undeliverable':
      return '現在の判定：配信不能（購読なし・メールなし）'
  }
}

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

async function requireAllowlistedStudent(
  admin: AdminClient,
  targetUserId: string,
  allowlist: ReadonlySet<string>,
): Promise<{ ok: true } | { ok: false; code: 'forbidden_target' | 'db_error' }> {
  const normalized = targetUserId.toLowerCase()
  if (!allowlist.has(normalized)) {
    return { ok: false, code: 'forbidden_target' }
  }

  const { data, error } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', targetUserId)
    .maybeSingle<{ id: string; role: string }>()

  if (error) return { ok: false, code: 'db_error' }
  if (!data || data.role !== 'student') {
    return { ok: false, code: 'forbidden_target' }
  }
  if (!allowlist.has(data.id.toLowerCase())) {
    return { ok: false, code: 'forbidden_target' }
  }
  return { ok: true }
}

export async function listAdminNotificationTestTargets(): Promise<
  | { ok: true; targets: AdminTestTargetOption[]; featureAvailable: true }
  | {
      ok: true
      targets: []
      featureAvailable: false
      reason: 'flag_off' | 'allowlist_empty' | 'allowlist_invalid' | 'admin_unavailable'
    }
  | { ok: false; code: 'db_error' }
> {
  const availability = resolveAdminNotificationTestAvailability()
  if (!availability.available) {
    return {
      ok: true,
      targets: [],
      featureAvailable: false,
      reason: availability.reason,
    }
  }

  const admin = createAdminClient()
  if (!admin) {
    return {
      ok: true,
      targets: [],
      featureAvailable: false,
      reason: 'admin_unavailable',
    }
  }

  const ids = [...availability.allowlist]
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, display_name, role')
    .eq('role', 'student')
    .in('id', ids)

  if (error) return { ok: false, code: 'db_error' }

  const targets = (data ?? [])
    .filter((row) => availability.allowlist.has(String(row.id).toLowerCase()))
    .map((row) => ({
      id: String(row.id),
      label: getPersonName({
        full_name: String(row.full_name ?? ''),
        display_name: row.display_name as string | null,
      }),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'))

  return { ok: true, targets, featureAvailable: true }
}

async function profileHasEmail(
  admin: AdminClient,
  userId: string,
): Promise<{ ok: true; hasEmail: boolean } | { ok: false }> {
  const { data, error } = await admin
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle<{ email: string | null }>()

  if (error) return { ok: false }
  const email = typeof data?.email === 'string' ? data.email.trim() : ''
  return { ok: true, hasEmail: email.length > 0 }
}

async function preferenceRowExists(
  admin: AdminClient,
  userId: string,
): Promise<{ ok: true; exists: boolean } | { ok: false }> {
  const { data, error } = await admin
    .from('notification_preferences')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle<{ user_id: string }>()

  if (error) return { ok: false }
  return { ok: true, exists: Boolean(data) }
}

export async function inspectAdminNotificationTestTarget(params: {
  targetUserId: string
}): Promise<
  | { ok: true; inspect: AdminTestInspectResult }
  | {
      ok: false
      code:
        | 'feature_disabled'
        | 'forbidden_target'
        | 'admin_unavailable'
        | 'db_error'
    }
> {
  const availability = resolveAdminNotificationTestAvailability()
  if (!availability.available) {
    return { ok: false, code: 'feature_disabled' }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  const allowed = await requireAllowlistedStudent(
    admin,
    params.targetUserId,
    availability.allowlist,
  )
  if (!allowed.ok) return { ok: false, code: allowed.code }

  const dateKey = getJstDateKey()
  const [recorded, pref, rowExists, subs, email, mode] = await Promise.all([
    hasStudyLogOnDate(admin, params.targetUserId, dateKey),
    getStudyReminderPreferenceEnabled(admin, params.targetUserId),
    preferenceRowExists(admin, params.targetUserId),
    countActivePushSubscriptions(admin, params.targetUserId),
    profileHasEmail(admin, params.targetUserId),
    Promise.resolve(resolveEffectiveStudyReminderMode()),
  ])

  if (!recorded.ok || !pref.ok || !rowExists.ok || !subs.ok || !email.ok) {
    return { ok: false, code: 'db_error' }
  }

  const pushSendingEnabled = isPushSendingAvailable()
  let projectedOutcome: AdminTestProjectedOutcome

  if (recorded.hasLog) {
    projectedOutcome = 'already_recorded'
  } else if (!pref.enabled) {
    projectedOutcome = 'preference_disabled'
  } else if (subs.count > 0 && pushSendingEnabled) {
    projectedOutcome = 'would_use_push'
  } else if (email.hasEmail) {
    projectedOutcome = 'would_fallback_email'
  } else {
    projectedOutcome = 'undeliverable'
  }

  return {
    ok: true,
    inspect: {
      recordedToday: recorded.hasLog,
      preferenceEnabled: pref.enabled,
      preferenceRowExists: rowExists.exists,
      hasActivePushSubscription: subs.count > 0,
      canEmailFallback: email.hasEmail,
      pushSendingEnabled,
      deliveryMode: mode.mode,
      projectedOutcome,
      projectedOutcomeLabel: projectedLabel(projectedOutcome),
    },
  }
}

async function findExistingTestEvent(
  admin: AdminClient,
  userId: string,
  idempotencyKey: string,
): Promise<{ ok: true; eventId: string | null } | { ok: false }> {
  const { data, error } = await admin
    .from('notification_events')
    .select('id')
    .eq('user_id', userId)
    .eq('notification_type', 'test')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle<{ id: string }>()

  if (error) return { ok: false }
  return { ok: true, eventId: data?.id ?? null }
}

export async function sendAdminNotificationTestPush(params: {
  adminUserId: string
  targetUserId: string
  nowMs?: number
}): Promise<
  | { ok: true; sent: number; eventCreated: boolean }
  | {
      ok: false
      code:
        | 'feature_disabled'
        | 'push_disabled'
        | 'forbidden_target'
        | 'admin_unavailable'
        | 'rate_limited'
        | 'no_subscriptions'
        | 'send_failed'
        | 'db_error'
      retryAfterSeconds?: number
    }
> {
  const availability = resolveAdminNotificationTestAvailability()
  if (!availability.available) return { ok: false, code: 'feature_disabled' }
  if (!isPushSendingAvailable()) return { ok: false, code: 'push_disabled' }

  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  const allowed = await requireAllowlistedStudent(
    admin,
    params.targetUserId,
    availability.allowlist,
  )
  if (!allowed.ok) return { ok: false, code: allowed.code }

  const nowMs = params.nowMs ?? Date.now()
  const idempotencyKey = buildAdminTestIdempotencyKey({
    kind: 'push',
    adminUserId: params.adminUserId,
    targetUserId: params.targetUserId,
    nowMs,
  })

  const existing = await findExistingTestEvent(admin, params.targetUserId, idempotencyKey)
  if (!existing.ok) return { ok: false, code: 'db_error' }
  if (existing.eventId) {
    return {
      ok: false,
      code: 'rate_limited',
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (ADMIN_NOTIFICATION_TEST_COOLDOWN_MS - (nowMs % ADMIN_NOTIFICATION_TEST_COOLDOWN_MS)) /
            1000,
        ),
      ),
    }
  }

  const result = await sendPushNotification({
    userId: params.targetUserId,
    notificationType: 'test',
    idempotencyKey,
    title: ADMIN_TEST_PUSH_TITLE,
    body: ADMIN_TEST_PUSH_BODY,
    targetPath: ADMIN_TEST_PUSH_PATH,
    tag: 'admin-notification-test',
  })

  // Attach metadata after create when possible (best-effort; never fail the send).
  if (result.ok) {
    await admin
      .from('notification_events')
      .update({
        metadata: {
          source: 'admin_notification_test',
          kind: 'push',
          adminUserId: params.adminUserId,
        },
      })
      .eq('id', result.eventId)

    if (result.sent < 1) {
      return { ok: false, code: 'send_failed' }
    }
    return { ok: true, sent: result.sent, eventCreated: result.eventCreated }
  }

  if (result.code === 'no_subscriptions') return { ok: false, code: 'no_subscriptions' }
  if (result.code === 'disabled' || result.code === 'not_configured') {
    return { ok: false, code: 'push_disabled' }
  }
  return { ok: false, code: 'send_failed' }
}

export async function sendAdminNotificationTestEmail(params: {
  adminUserId: string
  targetUserId: string
  nowMs?: number
}): Promise<
  | { ok: true }
  | {
      ok: false
      code:
        | 'feature_disabled'
        | 'forbidden_target'
        | 'admin_unavailable'
        | 'rate_limited'
        | 'no_email'
        | 'email_not_configured'
        | 'send_failed'
        | 'db_error'
      retryAfterSeconds?: number
    }
> {
  const availability = resolveAdminNotificationTestAvailability()
  if (!availability.available) return { ok: false, code: 'feature_disabled' }

  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  const allowed = await requireAllowlistedStudent(
    admin,
    params.targetUserId,
    availability.allowlist,
  )
  if (!allowed.ok) return { ok: false, code: allowed.code }

  const nowMs = params.nowMs ?? Date.now()
  const idempotencyKey = buildAdminTestIdempotencyKey({
    kind: 'email',
    adminUserId: params.adminUserId,
    targetUserId: params.targetUserId,
    nowMs,
  })

  const existing = await findExistingTestEvent(admin, params.targetUserId, idempotencyKey)
  if (!existing.ok) return { ok: false, code: 'db_error' }
  if (existing.eventId) {
    return {
      ok: false,
      code: 'rate_limited',
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (ADMIN_NOTIFICATION_TEST_COOLDOWN_MS - (nowMs % ADMIN_NOTIFICATION_TEST_COOLDOWN_MS)) /
            1000,
        ),
      ),
    }
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('email')
    .eq('id', params.targetUserId)
    .maybeSingle<{ email: string | null }>()

  if (profileError) return { ok: false, code: 'db_error' }
  const to = typeof profile?.email === 'string' ? profile.email.trim() : ''
  if (!to) return { ok: false, code: 'no_email' }

  const { data: inserted, error: insertError } = await admin
    .from('notification_events')
    .insert({
      user_id: params.targetUserId,
      notification_type: 'test',
      idempotency_key: idempotencyKey,
      title: ADMIN_TEST_PUSH_TITLE,
      body: ADMIN_TEST_EMAIL_SUBJECT,
      target_path: ADMIN_TEST_PUSH_PATH,
      metadata: {
        source: 'admin_notification_test',
        kind: 'email',
        adminUserId: params.adminUserId,
      },
    })
    .select('id')
    .single<{ id: string }>()

  if (insertError) {
    if (insertError.code === '23505') {
      return {
        ok: false,
        code: 'rate_limited',
        retryAfterSeconds: Math.max(
          1,
          Math.ceil(
            (ADMIN_NOTIFICATION_TEST_COOLDOWN_MS -
              (nowMs % ADMIN_NOTIFICATION_TEST_COOLDOWN_MS)) /
              1000,
          ),
        ),
      }
    }
    return { ok: false, code: 'db_error' }
  }

  if (!inserted) return { ok: false, code: 'db_error' }

  const { error: deliveryInsertError } = await admin.from('notification_deliveries').insert({
    event_id: inserted.id,
    channel: 'email',
    subscription_id: null,
    status: 'pending',
    attempt_count: 1,
    sent_at: new Date().toISOString(),
  })

  if (deliveryInsertError) {
    if (deliveryInsertError.code === '23505') {
      return { ok: false, code: 'rate_limited' }
    }
    return { ok: false, code: 'db_error' }
  }

  const studyUrl = `${getAppBaseUrl()}/dashboard/study`
  const sendResult = await sendEmail({
    to,
    subject: ADMIN_TEST_EMAIL_SUBJECT,
    text: `${ADMIN_TEST_EMAIL_BODY}\n\n確認する: ${studyUrl}`,
    omitRecipientFromLogs: true,
    pace: true,
  })

  if (sendResult.ok) {
    await admin
      .from('notification_deliveries')
      .update({
        status: 'sent',
        http_status: sendResult.httpStatus ?? 200,
        error_code: null,
        succeeded_at: new Date().toISOString(),
      })
      .eq('event_id', inserted.id)
      .eq('channel', 'email')
    return { ok: true }
  }

  await admin
    .from('notification_deliveries')
    .update({
      status: 'failed',
      http_status: sendResult.httpStatus ?? null,
      error_code: sendResult.errorClass ?? (sendResult.skipped ? 'email_not_configured' : 'email_send_failed'),
      succeeded_at: null,
    })
    .eq('event_id', inserted.id)
    .eq('channel', 'email')

  if (sendResult.skipped) return { ok: false, code: 'email_not_configured' }
  return { ok: false, code: 'send_failed' }
}

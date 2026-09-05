/**
 * Admin-only study-reminder integration test (single allowlisted student).
 * Reuses processStudyReminderNewPath; never uses Cron daily idempotency keys.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { isPushSendingAvailable, resolvePushSendConfig } from '@/lib/push/send-config'
import { getJstDateKey } from '@/lib/study/dates'
import {
  countActivePushSubscriptions,
  getStudyReminderPreferenceEnabled,
  hasStudyLogOnDate,
  processStudyReminderNewPath,
} from '@/lib/study/study-reminder-new-path'
import {
  isVercelNonProduction,
  resolveEffectiveStudyReminderMode,
} from '@/lib/study/study-reminder-mode'
import {
  ADMIN_STUDY_REMINDER_INTEGRATION_TEST_COOLDOWN_MS,
  buildAdminStudyReminderIntegrationIdempotencyKey,
  resolveAdminNotificationTestAvailability,
} from '@/lib/admin/notification-test-config'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const inFlightAdmins = new Set<string>()

/** Test-only reset. */
export function resetAdminStudyReminderIntegrationGateForTests(): void {
  inFlightAdmins.clear()
}

export type StudyReminderIntegrationProjectedOutcome =
  | 'already_recorded'
  | 'preference_disabled'
  | 'would_use_push'
  | 'would_fallback_email'
  | 'undeliverable'
  | 'config_incomplete'
  | 'preview_skip'

export type StudyReminderIntegrationInspect = {
  dateKey: string
  recordedToday: boolean
  preferenceEnabled: boolean
  preferenceRowExists: boolean
  hasActivePushSubscription: boolean
  canEmailFallback: boolean
  pushSendingEnabled: boolean
  deliveryMode: string
  projectedOutcome: StudyReminderIntegrationProjectedOutcome
  projectedOutcomeLabel: string
}

export type StudyReminderIntegrationSendResult =
  | {
      ok: true
      sent: boolean
      pushSent: boolean
      emailSent: boolean
      skippedReason: string | null
      failed: boolean
    }
  | {
      ok: false
      code:
        | 'feature_disabled'
        | 'forbidden_target'
        | 'invalid_target'
        | 'admin_unavailable'
        | 'rate_limited'
        | 'in_progress'
        | 'db_error'
        | 'send_failed'
      retryAfterSeconds?: number
      skippedReason?: string | null
      failed?: boolean
      sent?: boolean
      pushSent?: boolean
      emailSent?: boolean
    }

function projectedLabel(outcome: StudyReminderIntegrationProjectedOutcome): string {
  switch (outcome) {
    case 'already_recorded':
      return '記録済みのため対象外'
    case 'preference_disabled':
      return '管理者により停止'
    case 'would_use_push':
      return 'Push対象'
    case 'would_fallback_email':
      return 'メールfallback対象'
    case 'undeliverable':
      return '配信手段なし'
    case 'config_incomplete':
      return '設定不足'
    case 'preview_skip':
      return 'Previewのため非送信'
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

async function loadStudentEmail(
  admin: AdminClient,
  userId: string,
): Promise<{ ok: true; email: string | null } | { ok: false }> {
  const { data, error } = await admin
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle<{ email: string | null }>()

  if (error) return { ok: false }
  const email = typeof data?.email === 'string' ? data.email.trim() : ''
  return { ok: true, email: email.length > 0 ? email : null }
}

function formatJstDateLabel(dateKey: string): string {
  const [, m, d] = dateKey.split('-')
  return `${Number(m)}月${Number(d)}日`
}

export async function inspectAdminStudyReminderIntegration(params: {
  targetUserId: string
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<
  | { ok: true; inspect: StudyReminderIntegrationInspect }
  | {
      ok: false
      code:
        | 'feature_disabled'
        | 'forbidden_target'
        | 'invalid_target'
        | 'admin_unavailable'
        | 'db_error'
    }
> {
  const env = params.env ?? process.env
  const availability = resolveAdminNotificationTestAvailability(env)
  if (!availability.available) return { ok: false, code: 'feature_disabled' }

  if (!UUID_RE.test(params.targetUserId)) {
    return { ok: false, code: 'invalid_target' }
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
  const [recorded, pref, rowExists, subs, email] = await Promise.all([
    hasStudyLogOnDate(admin, params.targetUserId, dateKey),
    getStudyReminderPreferenceEnabled(admin, params.targetUserId),
    preferenceRowExists(admin, params.targetUserId),
    countActivePushSubscriptions(admin, params.targetUserId),
    loadStudentEmail(admin, params.targetUserId),
  ])

  if (!recorded.ok || !pref.ok || !rowExists.ok || !subs.ok || !email.ok) {
    return { ok: false, code: 'db_error' }
  }

  const mode = resolveEffectiveStudyReminderMode(env)
  const pushSendingEnabled = isPushSendingAvailable(env)
  const pushConfig = resolvePushSendConfig(env)
  const preview = isVercelNonProduction(env)

  let projectedOutcome: StudyReminderIntegrationProjectedOutcome

  if (recorded.hasLog) {
    projectedOutcome = 'already_recorded'
  } else if (!pref.enabled) {
    projectedOutcome = 'preference_disabled'
  } else if (preview) {
    projectedOutcome = 'preview_skip'
  } else if (
    !pushSendingEnabled &&
    pushConfig.ok === false &&
    pushConfig.reason === 'incomplete' &&
    !email.email
  ) {
    projectedOutcome = 'config_incomplete'
  } else if (subs.count > 0 && pushSendingEnabled) {
    projectedOutcome = 'would_use_push'
  } else if (email.email) {
    projectedOutcome = 'would_fallback_email'
  } else if (!pushSendingEnabled && pushConfig.ok === false && pushConfig.reason === 'incomplete') {
    projectedOutcome = 'config_incomplete'
  } else {
    projectedOutcome = 'undeliverable'
  }

  return {
    ok: true,
    inspect: {
      dateKey,
      recordedToday: recorded.hasLog,
      preferenceEnabled: pref.enabled,
      preferenceRowExists: rowExists.exists,
      hasActivePushSubscription: subs.count > 0,
      canEmailFallback: Boolean(email.email),
      pushSendingEnabled,
      deliveryMode: mode.mode,
      projectedOutcome,
      projectedOutcomeLabel: projectedLabel(projectedOutcome),
    },
  }
}

export async function sendAdminStudyReminderIntegrationTest(params: {
  adminUserId: string
  targetUserId: string
  nowMs?: number
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<StudyReminderIntegrationSendResult> {
  const env = params.env ?? process.env
  const availability = resolveAdminNotificationTestAvailability(env)
  if (!availability.available) return { ok: false, code: 'feature_disabled' }

  if (!UUID_RE.test(params.targetUserId)) {
    return { ok: false, code: 'invalid_target' }
  }

  if (inFlightAdmins.has(params.adminUserId)) {
    return { ok: false, code: 'in_progress' }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  const allowed = await requireAllowlistedStudent(
    admin,
    params.targetUserId,
    availability.allowlist,
  )
  if (!allowed.ok) return { ok: false, code: allowed.code }

  const nowMs = params.nowMs ?? Date.now()
  const idempotencyKey = buildAdminStudyReminderIntegrationIdempotencyKey({
    targetUserId: params.targetUserId,
    nowMs,
  })

  // Pre-check rate limit via existing event (without logging the key contents beyond length).
  const { data: existing, error: existingError } = await admin
    .from('notification_events')
    .select('id')
    .eq('user_id', params.targetUserId)
    .eq('notification_type', 'study_reminder')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle<{ id: string }>()

  if (existingError) return { ok: false, code: 'db_error' }
  if (existing?.id) {
    return {
      ok: false,
      code: 'rate_limited',
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (ADMIN_STUDY_REMINDER_INTEGRATION_TEST_COOLDOWN_MS -
            (nowMs % ADMIN_STUDY_REMINDER_INTEGRATION_TEST_COOLDOWN_MS)) /
            1000,
        ),
      ),
    }
  }

  const emailLoaded = await loadStudentEmail(admin, params.targetUserId)
  if (!emailLoaded.ok) return { ok: false, code: 'db_error' }

  const dateKey = getJstDateKey()
  const dateLabel = formatJstDateLabel(dateKey)

  inFlightAdmins.add(params.adminUserId)
  try {
    const outcome = await processStudyReminderNewPath({
      candidate: {
        studentId: params.targetUserId,
        email: emailLoaded.email,
      },
      dateKey,
      dateLabel,
      idempotencyKey,
      tag: `study-reminder-admin-test-${dateKey}`,
      eventMetadata: {
        source: 'admin_notification_ops',
        kind: 'study_reminder_integration_test',
        adminUserId: params.adminUserId,
      },
      nowMs,
      env,
    })

    switch (outcome) {
      case 'push_sent':
        return {
          ok: true,
          sent: true,
          pushSent: true,
          emailSent: false,
          skippedReason: null,
          failed: false,
        }
      case 'email_sent':
        return {
          ok: true,
          sent: true,
          pushSent: false,
          emailSent: true,
          skippedReason: null,
          failed: false,
        }
      case 'recorded_before_send':
        return {
          ok: true,
          sent: false,
          pushSent: false,
          emailSent: false,
          skippedReason: 'already_recorded',
          failed: false,
        }
      case 'preference_disabled':
        return {
          ok: true,
          sent: false,
          pushSent: false,
          emailSent: false,
          skippedReason: 'preference_disabled',
          failed: false,
        }
      case 'non_production_skip':
        return {
          ok: true,
          sent: false,
          pushSent: false,
          emailSent: false,
          skippedReason: 'preview',
          failed: false,
        }
      case 'undeliverable':
        return {
          ok: true,
          sent: false,
          pushSent: false,
          emailSent: false,
          skippedReason: 'undeliverable',
          failed: false,
        }
      case 'already_completed':
      case 'in_progress':
      case 'stale_pending':
        return {
          ok: false,
          code: 'rate_limited',
          retryAfterSeconds: Math.max(
            1,
            Math.ceil(
              (ADMIN_STUDY_REMINDER_INTEGRATION_TEST_COOLDOWN_MS -
                (nowMs % ADMIN_STUDY_REMINDER_INTEGRATION_TEST_COOLDOWN_MS)) /
                1000,
            ),
          ),
          sent: false,
          pushSent: false,
          emailSent: false,
          skippedReason: outcome,
          failed: false,
        }
      case 'email_failed':
      case 'timed_out':
      case 'failed':
        return {
          ok: false,
          code: 'send_failed',
          sent: false,
          pushSent: false,
          emailSent: false,
          skippedReason: null,
          failed: true,
        }
      default:
        return { ok: false, code: 'send_failed', failed: true }
    }
  } finally {
    inFlightAdmins.delete(params.adminUserId)
  }
}

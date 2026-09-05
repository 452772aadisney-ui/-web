/**
 * Admin-only coaching reminder integration tests (single allowlisted student).
 * Reuses processCoachingReminderNewPath + ensureBookingPromptChat.
 * Never uses Cron idempotency keys. Never scans all students.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { isPushSendingAvailable, resolvePushSendConfig } from '@/lib/push/send-config'
import { countActivePushSubscriptions } from '@/lib/study/study-reminder-new-path'
import { isVercelNonProduction } from '@/lib/study/study-reminder-mode'
import {
  addDaysToDateKey,
  formatJstHm,
  getJstWeekDateKeys,
  getJstWeekMondayDateKey,
} from '@/lib/coaching/coaching-reminder-jst'
import {
  isStudentExcludedAsGraduate,
  loadTomorrowBookingsForStudent,
  sessionBookingStillValid,
  studentStillUnbookedThisWeek,
} from '@/lib/coaching/coaching-reminder-candidates'
import {
  BOOKING_PROMPT_PUSH_BODY,
  sessionPreviousDayPushBody,
} from '@/lib/coaching/coaching-reminder-email'
import {
  getCoachingReminderPreferenceEnabled,
  processCoachingReminderNewPath,
  type CoachingReminderNewPathOutcome,
} from '@/lib/coaching/coaching-reminder-new-path'
import { ensureBookingPromptChat } from '@/lib/coaching/coaching-booking-prompt-orchestrator'
import { resolveEffectiveCoachingReminderMode } from '@/lib/coaching/coaching-reminder-mode'
import {
  ADMIN_COACHING_INTEGRATION_TEST_COOLDOWN_MS,
  buildAdminCoachingBookingPromptIntegrationIdempotencyKey,
  buildAdminCoachingSessionPreviousDayIntegrationIdempotencyKey,
  resolveAdminNotificationTestAvailability,
} from '@/lib/admin/notification-test-config'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const inFlightAdmins = new Set<string>()

/** Test-only reset. */
export function resetAdminCoachingIntegrationGateForTests(): void {
  inFlightAdmins.clear()
}

export type CoachingIntegrationProjectedOutcome =
  | 'already_booked'
  | 'graduate_excluded'
  | 'no_scheduled_booking'
  | 'preference_disabled'
  | 'would_use_push'
  | 'would_fallback_email'
  | 'undeliverable'
  | 'config_incomplete'
  | 'preview_skip'

export type CoachingBookingPromptInspect = {
  weekMondayKey: string
  weekLabel: string
  isStudent: boolean
  graduateExcluded: boolean
  hasBookingThisWeek: boolean
  preferenceEnabled: boolean
  preferenceRowExists: boolean
  hasActivePushSubscription: boolean
  canEmailFallback: boolean
  pushSendingEnabled: boolean
  deliveryMode: string
  projectedOutcome: CoachingIntegrationProjectedOutcome
  projectedOutcomeLabel: string
}

export type CoachingSessionBookingInspectRow = {
  startTimeHm: string
  status: string
  projectedOutcome: CoachingIntegrationProjectedOutcome
  projectedOutcomeLabel: string
}

export type CoachingSessionPreviousDayInspect = {
  tomorrowKey: string
  scheduledCount: number
  startTimes: string[]
  preferenceEnabled: boolean
  preferenceRowExists: boolean
  hasActivePushSubscription: boolean
  canEmailFallback: boolean
  pushSendingEnabled: boolean
  deliveryMode: string
  bookings: CoachingSessionBookingInspectRow[]
  projectedOutcome: CoachingIntegrationProjectedOutcome
  projectedOutcomeLabel: string
}

export type CoachingIntegrationSendResult =
  | {
      ok: true
      eligible: boolean
      sent: boolean
      pushSent: boolean
      emailSent: boolean
      chatMessageCreated: boolean
      skippedReason: string | null
      failed: boolean
      processedCount?: number
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
      eligible?: boolean
      sent?: boolean
      pushSent?: boolean
      emailSent?: boolean
      chatMessageCreated?: boolean
      skippedReason?: string | null
      failed?: boolean
      processedCount?: number
    }

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

function projectedLabel(outcome: CoachingIntegrationProjectedOutcome): string {
  switch (outcome) {
    case 'already_booked':
      return '今週予約ありのため対象外'
    case 'graduate_excluded':
      return '既卒除外のため対象外'
    case 'no_scheduled_booking':
      return '明日のscheduled予約なし'
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

function retryAfterSeconds(nowMs: number): number {
  return Math.max(
    1,
    Math.ceil(
      (ADMIN_COACHING_INTEGRATION_TEST_COOLDOWN_MS -
        (nowMs % ADMIN_COACHING_INTEGRATION_TEST_COOLDOWN_MS)) /
        1000,
    ),
  )
}

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

function projectDeliveryOutcome(params: {
  preferenceEnabled: boolean
  hasActivePush: boolean
  hasEmail: boolean
  pushSendingEnabled: boolean
  pushConfigIncomplete: boolean
  preview: boolean
}): CoachingIntegrationProjectedOutcome {
  if (!params.preferenceEnabled) return 'preference_disabled'
  if (params.preview) return 'preview_skip'
  if (
    !params.pushSendingEnabled &&
    params.pushConfigIncomplete &&
    !params.hasEmail
  ) {
    return 'config_incomplete'
  }
  if (params.hasActivePush && params.pushSendingEnabled) return 'would_use_push'
  if (params.hasEmail) return 'would_fallback_email'
  if (!params.pushSendingEnabled && params.pushConfigIncomplete) {
    return 'config_incomplete'
  }
  return 'undeliverable'
}

function mapNewPathOutcome(
  outcome: CoachingReminderNewPathOutcome,
  extras: { chatMessageCreated: boolean },
): CoachingIntegrationSendResult {
  switch (outcome) {
    case 'push_sent':
      return {
        ok: true,
        eligible: true,
        sent: true,
        pushSent: true,
        emailSent: false,
        chatMessageCreated: extras.chatMessageCreated,
        skippedReason: null,
        failed: false,
      }
    case 'email_sent':
      return {
        ok: true,
        eligible: true,
        sent: true,
        pushSent: false,
        emailSent: true,
        chatMessageCreated: extras.chatMessageCreated,
        skippedReason: null,
        failed: false,
      }
    case 'preference_disabled':
      return {
        ok: true,
        eligible: false,
        sent: false,
        pushSent: false,
        emailSent: false,
        chatMessageCreated: extras.chatMessageCreated,
        skippedReason: 'preference_disabled',
        failed: false,
      }
    case 'non_production_skip':
      return {
        ok: true,
        eligible: true,
        sent: false,
        pushSent: false,
        emailSent: false,
        chatMessageCreated: extras.chatMessageCreated,
        skippedReason: 'preview',
        failed: false,
      }
    case 'undeliverable':
      return {
        ok: true,
        eligible: true,
        sent: false,
        pushSent: false,
        emailSent: false,
        chatMessageCreated: extras.chatMessageCreated,
        skippedReason: 'undeliverable',
        failed: false,
      }
    case 'already_completed':
    case 'in_progress':
    case 'stale_pending':
      return {
        ok: false,
        code: 'rate_limited',
        retryAfterSeconds: retryAfterSeconds(Date.now()),
        eligible: true,
        sent: false,
        pushSent: false,
        emailSent: false,
        chatMessageCreated: extras.chatMessageCreated,
        skippedReason: outcome,
        failed: false,
      }
    case 'email_failed':
    case 'timed_out':
    case 'failed':
      return {
        ok: false,
        code: 'send_failed',
        eligible: true,
        sent: false,
        pushSent: false,
        emailSent: false,
        chatMessageCreated: extras.chatMessageCreated,
        skippedReason: null,
        failed: true,
      }
    default:
      return {
        ok: false,
        code: 'send_failed',
        chatMessageCreated: extras.chatMessageCreated,
        failed: true,
      }
  }
}

export async function inspectAdminCoachingBookingPromptIntegration(params: {
  targetUserId: string
  now?: Date
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<
  | { ok: true; inspect: CoachingBookingPromptInspect }
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
  if (!UUID_RE.test(params.targetUserId)) return { ok: false, code: 'invalid_target' }

  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  const allowed = await requireAllowlistedStudent(
    admin,
    params.targetUserId,
    availability.allowlist,
  )
  if (!allowed.ok) return { ok: false, code: allowed.code }

  const weekMondayKey = getJstWeekMondayDateKey(params.now)
  const weekDates = getJstWeekDateKeys(weekMondayKey)
  const weekEnd = addDaysToDateKey(weekMondayKey, 6)

  const [graduate, unbooked, pref, rowExists, subs, email] = await Promise.all([
    isStudentExcludedAsGraduate(admin, params.targetUserId),
    studentStillUnbookedThisWeek(admin, params.targetUserId, weekDates),
    getCoachingReminderPreferenceEnabled(admin, params.targetUserId),
    preferenceRowExists(admin, params.targetUserId),
    countActivePushSubscriptions(admin, params.targetUserId),
    loadStudentEmail(admin, params.targetUserId),
  ])

  if (
    !graduate.ok ||
    !unbooked.ok ||
    !pref.ok ||
    !rowExists.ok ||
    !subs.ok ||
    !email.ok
  ) {
    return { ok: false, code: 'db_error' }
  }

  const mode = resolveEffectiveCoachingReminderMode(env)
  const pushSendingEnabled = isPushSendingAvailable(env)
  const pushConfig = resolvePushSendConfig(env)
  const preview = isVercelNonProduction(env)
  const pushConfigIncomplete =
    pushConfig.ok === false && pushConfig.reason === 'incomplete'

  let projectedOutcome: CoachingIntegrationProjectedOutcome
  if (graduate.excluded) {
    projectedOutcome = 'graduate_excluded'
  } else if (!unbooked.unbooked) {
    projectedOutcome = 'already_booked'
  } else {
    projectedOutcome = projectDeliveryOutcome({
      preferenceEnabled: pref.enabled,
      hasActivePush: subs.count > 0,
      hasEmail: Boolean(email.email),
      pushSendingEnabled,
      pushConfigIncomplete,
      preview,
    })
  }

  return {
    ok: true,
    inspect: {
      weekMondayKey,
      weekLabel: `${weekMondayKey}〜${weekEnd}`,
      isStudent: true,
      graduateExcluded: graduate.excluded,
      hasBookingThisWeek: !unbooked.unbooked,
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

export async function sendAdminCoachingBookingPromptIntegrationTest(params: {
  adminUserId: string
  targetUserId: string
  nowMs?: number
  now?: Date
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<CoachingIntegrationSendResult> {
  const env = params.env ?? process.env
  const availability = resolveAdminNotificationTestAvailability(env)
  if (!availability.available) return { ok: false, code: 'feature_disabled' }
  if (!UUID_RE.test(params.targetUserId)) return { ok: false, code: 'invalid_target' }

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
  const idempotencyKey = buildAdminCoachingBookingPromptIntegrationIdempotencyKey({
    targetUserId: params.targetUserId,
    nowMs,
  })

  const { data: existing, error: existingError } = await admin
    .from('notification_events')
    .select('id')
    .eq('user_id', params.targetUserId)
    .eq('notification_type', 'coaching_reminder')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle<{ id: string }>()

  if (existingError) return { ok: false, code: 'db_error' }
  if (existing?.id) {
    return {
      ok: false,
      code: 'rate_limited',
      retryAfterSeconds: retryAfterSeconds(nowMs),
    }
  }

  const weekMondayKey = getJstWeekMondayDateKey(params.now)
  const weekDates = getJstWeekDateKeys(weekMondayKey)
  const weekEndExclusiveKey = addDaysToDateKey(weekMondayKey, 7)

  const [graduate, unbooked, email] = await Promise.all([
    isStudentExcludedAsGraduate(admin, params.targetUserId),
    studentStillUnbookedThisWeek(admin, params.targetUserId, weekDates),
    loadStudentEmail(admin, params.targetUserId),
  ])

  if (!graduate.ok || !unbooked.ok || !email.ok) {
    return { ok: false, code: 'db_error' }
  }

  if (graduate.excluded) {
    return {
      ok: true,
      eligible: false,
      sent: false,
      pushSent: false,
      emailSent: false,
      chatMessageCreated: false,
      skippedReason: 'graduate_excluded',
      failed: false,
    }
  }

  if (!unbooked.unbooked) {
    return {
      ok: true,
      eligible: false,
      sent: false,
      pushSent: false,
      emailSent: false,
      chatMessageCreated: false,
      skippedReason: 'already_booked',
      failed: false,
    }
  }

  inFlightAdmins.add(params.adminUserId)
  try {
    // Re-check immediately before chat / external send (same as Cron).
    const still = await studentStillUnbookedThisWeek(
      admin,
      params.targetUserId,
      weekDates,
    )
    if (!still.ok) return { ok: false, code: 'db_error' }
    if (!still.unbooked) {
      return {
        ok: true,
        eligible: false,
        sent: false,
        pushSent: false,
        emailSent: false,
        chatMessageCreated: false,
        skippedReason: 'already_booked',
        failed: false,
      }
    }

    const graduateAgain = await isStudentExcludedAsGraduate(admin, params.targetUserId)
    if (!graduateAgain.ok) return { ok: false, code: 'db_error' }
    if (graduateAgain.excluded) {
      return {
        ok: true,
        eligible: false,
        sent: false,
        pushSent: false,
        emailSent: false,
        chatMessageCreated: false,
        skippedReason: 'graduate_excluded',
        failed: false,
      }
    }

    const pref = await getCoachingReminderPreferenceEnabled(admin, params.targetUserId)
    if (!pref.ok) return { ok: false, code: 'db_error' }
    // Preference re-check: if disabled, still create chat (Cron behavior) then skip send.

    const chat = await ensureBookingPromptChat({
      admin,
      studentId: params.targetUserId,
      weekMondayKey,
      weekEndExclusiveKey,
      adminSenderId: params.adminUserId,
    })
    if (chat === 'failed') {
      return {
        ok: false,
        code: 'send_failed',
        eligible: true,
        sent: false,
        pushSent: false,
        emailSent: false,
        chatMessageCreated: false,
        failed: true,
      }
    }
    const chatMessageCreated = chat === 'created'

    if (!pref.enabled) {
      return {
        ok: true,
        eligible: false,
        sent: false,
        pushSent: false,
        emailSent: false,
        chatMessageCreated,
        skippedReason: 'preference_disabled',
        failed: false,
      }
    }

    const outcome = await processCoachingReminderNewPath({
      studentUserId: params.targetUserId,
      email: email.email,
      idempotencyKey,
      kind: 'booking_prompt',
      pushBody: BOOKING_PROMPT_PUSH_BODY,
      tag: `coaching-booking-prompt-admin-test-${weekMondayKey}`,
      eventMetadata: {
        source: 'admin_notification_ops',
        kind: 'coaching_booking_prompt_integration_test',
        adminUserId: params.adminUserId,
      },
      nowMs,
      env,
    })

    return mapNewPathOutcome(outcome, { chatMessageCreated })
  } finally {
    inFlightAdmins.delete(params.adminUserId)
  }
}

export async function inspectAdminCoachingSessionPreviousDayIntegration(params: {
  targetUserId: string
  now?: Date
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<
  | { ok: true; inspect: CoachingSessionPreviousDayInspect }
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
  if (!UUID_RE.test(params.targetUserId)) return { ok: false, code: 'invalid_target' }

  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  const allowed = await requireAllowlistedStudent(
    admin,
    params.targetUserId,
    availability.allowlist,
  )
  if (!allowed.ok) return { ok: false, code: allowed.code }

  const loaded = await loadTomorrowBookingsForStudent({
    studentId: params.targetUserId,
    now: params.now,
    admin,
  })
  if (!loaded.ok) return { ok: false, code: 'db_error' }

  const [pref, rowExists, subs, email] = await Promise.all([
    getCoachingReminderPreferenceEnabled(admin, params.targetUserId),
    preferenceRowExists(admin, params.targetUserId),
    countActivePushSubscriptions(admin, params.targetUserId),
    loadStudentEmail(admin, params.targetUserId),
  ])

  if (!pref.ok || !rowExists.ok || !subs.ok || !email.ok) {
    return { ok: false, code: 'db_error' }
  }

  const mode = resolveEffectiveCoachingReminderMode(env)
  const pushSendingEnabled = isPushSendingAvailable(env)
  const pushConfig = resolvePushSendConfig(env)
  const preview = isVercelNonProduction(env)
  const pushConfigIncomplete =
    pushConfig.ok === false && pushConfig.reason === 'incomplete'

  const deliveryOutcome = projectDeliveryOutcome({
    preferenceEnabled: pref.enabled,
    hasActivePush: subs.count > 0,
    hasEmail: Boolean(email.email),
    pushSendingEnabled,
    pushConfigIncomplete,
    preview,
  })

  const scheduled = loaded.bookings.filter((b) => b.status === 'scheduled')
  const bookings: CoachingSessionBookingInspectRow[] = loaded.bookings.map((b) => {
    let outcome: CoachingIntegrationProjectedOutcome
    if (b.status !== 'scheduled') {
      outcome = 'no_scheduled_booking'
    } else {
      outcome = deliveryOutcome
    }
    return {
      startTimeHm: formatJstHm(b.startsAt),
      status: b.status,
      projectedOutcome: outcome,
      projectedOutcomeLabel: projectedLabel(outcome),
    }
  })

  let projectedOutcome: CoachingIntegrationProjectedOutcome
  if (scheduled.length === 0) {
    projectedOutcome = 'no_scheduled_booking'
  } else {
    projectedOutcome = deliveryOutcome
  }

  return {
    ok: true,
    inspect: {
      tomorrowKey: loaded.tomorrowKey,
      scheduledCount: scheduled.length,
      startTimes: scheduled.map((b) => formatJstHm(b.startsAt)),
      preferenceEnabled: pref.enabled,
      preferenceRowExists: rowExists.exists,
      hasActivePushSubscription: subs.count > 0,
      canEmailFallback: Boolean(email.email),
      pushSendingEnabled,
      deliveryMode: mode.mode,
      bookings,
      projectedOutcome,
      projectedOutcomeLabel: projectedLabel(projectedOutcome),
    },
  }
}

export async function sendAdminCoachingSessionPreviousDayIntegrationTest(params: {
  adminUserId: string
  targetUserId: string
  nowMs?: number
  now?: Date
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<CoachingIntegrationSendResult> {
  const env = params.env ?? process.env
  const availability = resolveAdminNotificationTestAvailability(env)
  if (!availability.available) return { ok: false, code: 'feature_disabled' }
  if (!UUID_RE.test(params.targetUserId)) return { ok: false, code: 'invalid_target' }

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

  const loaded = await loadTomorrowBookingsForStudent({
    studentId: params.targetUserId,
    now: params.now,
    admin,
  })
  if (!loaded.ok) return { ok: false, code: 'db_error' }

  const scheduled = loaded.bookings.filter((b) => b.status === 'scheduled')
  if (scheduled.length === 0) {
    return {
      ok: true,
      eligible: false,
      sent: false,
      pushSent: false,
      emailSent: false,
      chatMessageCreated: false,
      skippedReason: 'no_scheduled_booking',
      failed: false,
      processedCount: 0,
    }
  }

  const email = await loadStudentEmail(admin, params.targetUserId)
  if (!email.ok) return { ok: false, code: 'db_error' }

  const nowMs = params.nowMs ?? Date.now()

  // Rate-limit if any booking already has an admin-bucket event.
  for (const booking of scheduled) {
    const key = buildAdminCoachingSessionPreviousDayIntegrationIdempotencyKey({
      bookingId: booking.bookingId,
      normalizedStartAt: booking.startsAt,
      nowMs,
    })
    const { data: existing, error } = await admin
      .from('notification_events')
      .select('id')
      .eq('user_id', params.targetUserId)
      .eq('notification_type', 'coaching_reminder')
      .eq('idempotency_key', key)
      .maybeSingle<{ id: string }>()
    if (error) return { ok: false, code: 'db_error' }
    if (existing?.id) {
      return {
        ok: false,
        code: 'rate_limited',
        retryAfterSeconds: retryAfterSeconds(nowMs),
      }
    }
  }

  inFlightAdmins.add(params.adminUserId)
  try {
    let pushSent = false
    let emailSent = false
    let sent = false
    let failed = false
    let skippedReason: string | null = null
    let processedCount = 0
    let eligibleAny = false

    for (const booking of scheduled) {
      const valid = await sessionBookingStillValid(
        admin,
        booking.bookingId,
        loaded.tomorrowKey,
        booking.startsAt,
      )
      if (!valid.ok) {
        failed = true
        continue
      }
      if (!valid.valid) {
        skippedReason = skippedReason ?? 'cancelled_or_changed'
        continue
      }

      eligibleAny = true
      const hm = formatJstHm(booking.startsAt)
      const idempotencyKey = buildAdminCoachingSessionPreviousDayIntegrationIdempotencyKey({
        bookingId: booking.bookingId,
        normalizedStartAt: booking.startsAt,
        nowMs,
      })

      const outcome = await processCoachingReminderNewPath({
        studentUserId: params.targetUserId,
        email: email.email,
        idempotencyKey,
        kind: 'session_previous_day',
        pushBody: sessionPreviousDayPushBody(hm),
        hm,
        tag: 'coaching-session-reminder-admin-test',
        eventMetadata: {
          source: 'admin_notification_ops',
          kind: 'coaching_session_previous_day_integration_test',
          adminUserId: params.adminUserId,
        },
        nowMs,
        env,
      })

      processedCount += 1
      const mapped = mapNewPathOutcome(outcome, { chatMessageCreated: false })
      if (!mapped.ok) {
        if (mapped.code === 'rate_limited') {
          return {
            ...mapped,
            chatMessageCreated: false,
          }
        }
        failed = true
        continue
      }
      if (mapped.pushSent) {
        pushSent = true
        sent = true
      }
      if (mapped.emailSent) {
        emailSent = true
        sent = true
      }
      if (mapped.skippedReason && !sent) {
        skippedReason = mapped.skippedReason
      }
      if (!mapped.eligible && mapped.skippedReason === 'preference_disabled') {
        // Preference off applies to all bookings — stop early (no event created by new-path).
        return {
          ok: true,
          eligible: false,
          sent: false,
          pushSent: false,
          emailSent: false,
          chatMessageCreated: false,
          skippedReason: 'preference_disabled',
          failed: false,
          processedCount,
        }
      }
    }

    if (!eligibleAny && !failed) {
      return {
        ok: true,
        eligible: false,
        sent: false,
        pushSent: false,
        emailSent: false,
        chatMessageCreated: false,
        skippedReason: skippedReason ?? 'cancelled_or_changed',
        failed: false,
        processedCount: 0,
      }
    }

    if (failed && !sent) {
      return {
        ok: false,
        code: 'send_failed',
        eligible: eligibleAny,
        sent: false,
        pushSent: false,
        emailSent: false,
        chatMessageCreated: false,
        skippedReason: null,
        failed: true,
        processedCount,
      }
    }

    return {
      ok: true,
      eligible: eligibleAny,
      sent,
      pushSent,
      emailSent,
      chatMessageCreated: false,
      skippedReason: sent ? null : skippedReason,
      failed: false,
      processedCount,
    }
  } finally {
    inFlightAdmins.delete(params.adminUserId)
  }
}

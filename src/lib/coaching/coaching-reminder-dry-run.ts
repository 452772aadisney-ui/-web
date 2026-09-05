/**
 * Read-only coaching reminder dry-run (booking prompt + session previous-day).
 * No chat / Push / email / event / delivery / booking mutations.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { isPushSendingAvailable } from '@/lib/push/send-config'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/push'
import {
  resolveEffectiveCoachingReminderMode,
  type CoachingReminderDeliveryMode,
} from '@/lib/coaching/coaching-reminder-mode'
import {
  loadBookingPromptCandidates,
  loadSessionReminderCandidates,
} from '@/lib/coaching/coaching-reminder-candidates'

export type CoachingDryRunFinalBucket =
  | 'preference_disabled'
  | 'would_use_push'
  | 'would_fallback_email'
  | 'cannot_deliver'
  | 'failed'

export type CoachingDryRunClassifyInput = {
  preferenceLookupOk: boolean
  preferenceEnabled: boolean
  subscriptionLookupOk: boolean
  hasActivePush: boolean
  emailLookupOk: boolean
  hasEmail: boolean
  pushSendingEnabled: boolean
}

export function classifyCoachingDryRunFinal(
  input: CoachingDryRunClassifyInput,
): CoachingDryRunFinalBucket {
  if (!input.preferenceLookupOk) return 'failed'
  if (!input.preferenceEnabled) return 'preference_disabled'

  if (input.pushSendingEnabled) {
    if (!input.subscriptionLookupOk) return 'failed'
    if (input.hasActivePush) return 'would_use_push'
  }

  if (!input.emailLookupOk) return 'failed'
  if (input.hasEmail) return 'would_fallback_email'
  return 'cannot_deliver'
}

export type CoachingPushReadinessBucket =
  | 'preference_disabled'
  | 'push_ready'
  | 'email_fallback'
  | 'cannot_deliver'
  | 'failed'

export function classifyCoachingPushReadiness(
  input: Omit<CoachingDryRunClassifyInput, 'pushSendingEnabled'>,
): CoachingPushReadinessBucket {
  if (!input.preferenceLookupOk) return 'failed'
  if (!input.preferenceEnabled) return 'preference_disabled'
  if (!input.subscriptionLookupOk) return 'failed'
  if (input.hasActivePush) return 'push_ready'
  if (!input.emailLookupOk) return 'failed'
  if (input.hasEmail) return 'email_fallback'
  return 'cannot_deliver'
}

export type CoachingBookingPromptDryRunSection = {
  weekMondayKey: string
  coachingEligibleUnbooked: number
  bookedThisWeek: number
  preferenceDisabled: number
  pushReady: number
  emailFallback: number
  cannotDeliver: number
  failed: number
}

export type CoachingSessionDryRunSection = {
  tomorrowKey: string
  validBookingsTomorrow: number
  preferenceDisabled: number
  pushReady: number
  emailFallback: number
  cannotDeliver: number
  failed: number
}

export type CoachingAdminDryRunReport = {
  evaluatedAt: string
  durationMs: number
  mode: CoachingReminderDeliveryMode
  pushSendingEnabled: boolean
  forcedLegacyReason: 'allowlist_empty' | 'allowlist_invalid' | null
  /** Push-on readiness (ignores PUSH_SENDING_ENABLED). */
  bookingPrompt: CoachingBookingPromptDryRunSection
  sessionPreviousDay: CoachingSessionDryRunSection
  /** Effective path using current Push flag (would_*). */
  bookingPromptCurrent: {
    preferenceDisabled: number
    wouldUsePush: number
    wouldFallbackEmail: number
    cannotDeliver: number
    failed: number
  }
  sessionPreviousDayCurrent: {
    preferenceDisabled: number
    wouldUsePush: number
    wouldFallbackEmail: number
    cannotDeliver: number
    failed: number
  }
}

type LookupMaps = {
  prefOk: Map<string, boolean>
  prefEnabled: Map<string, boolean>
  subOk: Map<string, boolean>
  hasPush: Map<string, boolean>
}

async function loadLookupMaps(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userIds: string[],
): Promise<LookupMaps> {
  const prefOk = new Map<string, boolean>()
  const prefEnabled = new Map<string, boolean>()
  const subOk = new Map<string, boolean>()
  const hasPush = new Map<string, boolean>()

  for (const id of userIds) {
    prefOk.set(id, true)
    prefEnabled.set(id, DEFAULT_NOTIFICATION_PREFERENCES.coaching_reminder)
    subOk.set(id, true)
    hasPush.set(id, false)
  }

  if (userIds.length === 0) {
    return { prefOk, prefEnabled, subOk, hasPush }
  }

  const { data: prefs, error: prefError } = await admin
    .from('notification_preferences')
    .select('user_id, coaching_reminder')
    .in('user_id', userIds)

  if (prefError) {
    for (const id of userIds) prefOk.set(id, false)
  } else {
    for (const row of (prefs ?? []) as Array<{
      user_id: string
      coaching_reminder: boolean
    }>) {
      prefEnabled.set(row.user_id, Boolean(row.coaching_reminder))
    }
  }

  const { data: subs, error: subError } = await admin
    .from('push_subscriptions')
    .select('user_id')
    .in('user_id', userIds)
    .is('disabled_at', null)

  if (subError) {
    for (const id of userIds) subOk.set(id, false)
  } else {
    for (const row of (subs ?? []) as Array<{ user_id: string }>) {
      hasPush.set(row.user_id, true)
    }
  }

  return { prefOk, prefEnabled, subOk, hasPush }
}

function tallyReadiness(
  bucket: CoachingPushReadinessBucket,
  section: {
    preferenceDisabled: number
    pushReady: number
    emailFallback: number
    cannotDeliver: number
    failed: number
  },
) {
  switch (bucket) {
    case 'preference_disabled':
      section.preferenceDisabled += 1
      break
    case 'push_ready':
      section.pushReady += 1
      break
    case 'email_fallback':
      section.emailFallback += 1
      break
    case 'cannot_deliver':
      section.cannotDeliver += 1
      break
    case 'failed':
      section.failed += 1
      break
  }
}

function tallyCurrent(
  bucket: CoachingDryRunFinalBucket,
  section: {
    preferenceDisabled: number
    wouldUsePush: number
    wouldFallbackEmail: number
    cannotDeliver: number
    failed: number
  },
) {
  switch (bucket) {
    case 'preference_disabled':
      section.preferenceDisabled += 1
      break
    case 'would_use_push':
      section.wouldUsePush += 1
      break
    case 'would_fallback_email':
      section.wouldFallbackEmail += 1
      break
    case 'cannot_deliver':
      section.cannotDeliver += 1
      break
    case 'failed':
      section.failed += 1
      break
  }
}

export async function evaluateCoachingAdminDryRunReport(params?: {
  now?: Date
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<
  | { ok: true; report: CoachingAdminDryRunReport }
  | { ok: false; code: 'admin_unavailable' | 'query_failed' }
> {
  const startedAt = Date.now()
  const env = params?.env ?? process.env
  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  const effective = resolveEffectiveCoachingReminderMode(env)
  const pushSendingEnabled = isPushSendingAvailable(env)

  const bookingLoaded = await loadBookingPromptCandidates({ now: params?.now, admin })
  const sessionLoaded = await loadSessionReminderCandidates({ now: params?.now, admin })
  if (!bookingLoaded.ok || !sessionLoaded.ok) {
    return { ok: false, code: 'query_failed' }
  }

  const userIds = [
    ...new Set([
      ...bookingLoaded.candidates.map((c) => c.studentId),
      ...sessionLoaded.candidates.map((c) => c.studentId),
    ]),
  ]

  const maps = await loadLookupMaps(admin, userIds)

  const bookingPrompt: CoachingBookingPromptDryRunSection = {
    weekMondayKey: bookingLoaded.weekMondayKey,
    coachingEligibleUnbooked: bookingLoaded.candidates.length,
    bookedThisWeek: bookingLoaded.bookedStudentCount,
    preferenceDisabled: 0,
    pushReady: 0,
    emailFallback: 0,
    cannotDeliver: 0,
    failed: 0,
  }

  const bookingPromptCurrent = {
    preferenceDisabled: 0,
    wouldUsePush: 0,
    wouldFallbackEmail: 0,
    cannotDeliver: 0,
    failed: 0,
  }

  for (const c of bookingLoaded.candidates) {
    const base = {
      preferenceLookupOk: maps.prefOk.get(c.studentId) ?? false,
      preferenceEnabled: maps.prefEnabled.get(c.studentId) ?? true,
      subscriptionLookupOk: maps.subOk.get(c.studentId) ?? false,
      hasActivePush: maps.hasPush.get(c.studentId) ?? false,
      emailLookupOk: true,
      hasEmail: Boolean(c.email),
    }
    tallyReadiness(classifyCoachingPushReadiness(base), bookingPrompt)
    tallyCurrent(
      classifyCoachingDryRunFinal({ ...base, pushSendingEnabled }),
      bookingPromptCurrent,
    )
  }

  const sessionPreviousDay: CoachingSessionDryRunSection = {
    tomorrowKey: sessionLoaded.tomorrowKey,
    validBookingsTomorrow: sessionLoaded.candidates.length,
    preferenceDisabled: 0,
    pushReady: 0,
    emailFallback: 0,
    cannotDeliver: 0,
    failed: 0,
  }

  const sessionPreviousDayCurrent = {
    preferenceDisabled: 0,
    wouldUsePush: 0,
    wouldFallbackEmail: 0,
    cannotDeliver: 0,
    failed: 0,
  }

  for (const c of sessionLoaded.candidates) {
    const base = {
      preferenceLookupOk: maps.prefOk.get(c.studentId) ?? false,
      preferenceEnabled: maps.prefEnabled.get(c.studentId) ?? true,
      subscriptionLookupOk: maps.subOk.get(c.studentId) ?? false,
      hasActivePush: maps.hasPush.get(c.studentId) ?? false,
      emailLookupOk: true,
      hasEmail: Boolean(c.email),
    }
    tallyReadiness(classifyCoachingPushReadiness(base), sessionPreviousDay)
    tallyCurrent(
      classifyCoachingDryRunFinal({ ...base, pushSendingEnabled }),
      sessionPreviousDayCurrent,
    )
  }

  return {
    ok: true,
    report: {
      evaluatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      mode: effective.mode,
      pushSendingEnabled,
      forcedLegacyReason: effective.forcedLegacyReason,
      bookingPrompt,
      sessionPreviousDay,
      bookingPromptCurrent,
      sessionPreviousDayCurrent,
    },
  }
}

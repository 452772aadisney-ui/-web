/**
 * Read-only announcement notification readiness classifier / aggregate.
 * No sends, no event/delivery writes, no announcement inserts.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { isPushSendingAvailable } from '@/lib/push/send-config'
import { fetchStudentList } from '@/lib/study/queries'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/push'
import {
  resolveEffectiveAnnouncementMode,
  type AnnouncementDeliveryMode,
} from '@/lib/announcements/announcement-delivery-mode'

export type AnnouncementDryRunFinalBucket =
  | 'preference_disabled'
  | 'would_use_push'
  | 'would_fallback_email'
  | 'cannot_deliver'
  | 'failed'

export type AnnouncementDryRunClassifyInput = {
  preferenceLookupOk: boolean
  preferenceEnabled: boolean
  subscriptionLookupOk: boolean
  hasActivePush: boolean
  emailLookupOk: boolean
  hasEmail: boolean
  pushSendingEnabled: boolean
}

/**
 * Same gate order as live new-path (minus idempotency / preview skip).
 */
export function classifyAnnouncementDryRunFinal(
  input: AnnouncementDryRunClassifyInput,
): AnnouncementDryRunFinalBucket {
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

export type AnnouncementPushReadinessBucket =
  | 'preference_disabled'
  | 'push_ready'
  | 'email_fallback'
  | 'cannot_deliver'
  | 'failed'

/** Ignore PUSH_SENDING_ENABLED — structural readiness only. */
export function classifyAnnouncementPushReadiness(
  input: Omit<AnnouncementDryRunClassifyInput, 'pushSendingEnabled'>,
): AnnouncementPushReadinessBucket {
  if (!input.preferenceLookupOk) return 'failed'
  if (!input.preferenceEnabled) return 'preference_disabled'
  if (!input.subscriptionLookupOk) return 'failed'
  if (input.hasActivePush) return 'push_ready'
  if (!input.emailLookupOk) return 'failed'
  if (input.hasEmail) return 'email_fallback'
  return 'cannot_deliver'
}

export type AnnouncementDryRunAggregate = {
  recipients: number
  preferenceDisabled: number
  wouldUsePush: number
  wouldFallbackEmail: number
  cannotDeliver: number
  failed: number
  mode: AnnouncementDeliveryMode
  pushSendingEnabled: boolean
}

export async function evaluateAnnouncementDeliveryDryRunAggregate(params?: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
  /** Optional subset; default = all students from fetchStudentList */
  studentIds?: string[]
}): Promise<
  | { ok: true; aggregate: AnnouncementDryRunAggregate }
  | { ok: false; code: 'admin_unavailable' | 'query_failed' }
> {
  const env = params?.env ?? process.env
  const effective = resolveEffectiveAnnouncementMode(env)
  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  let students
  try {
    students = await fetchStudentList()
  } catch {
    return { ok: false, code: 'query_failed' }
  }

  if (params?.studentIds && params.studentIds.length > 0) {
    const allow = new Set(params.studentIds.map((id) => id.toLowerCase()))
    students = students.filter((s) => allow.has(s.id.toLowerCase()))
  }

  const pushSendingEnabled = isPushSendingAvailable(env)
  const aggregate: AnnouncementDryRunAggregate = {
    recipients: students.length,
    preferenceDisabled: 0,
    wouldUsePush: 0,
    wouldFallbackEmail: 0,
    cannotDeliver: 0,
    failed: 0,
    mode: effective.mode,
    pushSendingEnabled,
  }

  for (const student of students) {
    const { data: prefRow, error: prefError } = await admin
      .from('notification_preferences')
      .select('announcement')
      .eq('user_id', student.id)
      .maybeSingle<{ announcement: boolean }>()

    const { data: subs, error: subError } = await admin
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', student.id)
      .is('disabled_at', null)
      .limit(1)

    const input: AnnouncementDryRunClassifyInput = {
      preferenceLookupOk: !prefError,
      preferenceEnabled: prefRow
        ? Boolean(prefRow.announcement)
        : DEFAULT_NOTIFICATION_PREFERENCES.announcement,
      subscriptionLookupOk: !subError,
      hasActivePush: (subs?.length ?? 0) > 0,
      emailLookupOk: true,
      hasEmail: Boolean(student.email?.trim()),
      pushSendingEnabled,
    }

    const bucket = classifyAnnouncementDryRunFinal(input)
    switch (bucket) {
      case 'preference_disabled':
        aggregate.preferenceDisabled += 1
        break
      case 'would_use_push':
        aggregate.wouldUsePush += 1
        break
      case 'would_fallback_email':
        aggregate.wouldFallbackEmail += 1
        break
      case 'cannot_deliver':
        aggregate.cannotDeliver += 1
        break
      case 'failed':
        aggregate.failed += 1
        break
    }
  }

  return { ok: true, aggregate }
}

export type AnnouncementAdminDryRunReport = {
  readiness: {
    recipients: number
    preferenceDisabled: number
    pushReady: number
    emailFallback: number
    cannotDeliver: number
    failed: number
  }
  current: AnnouncementDryRunAggregate
}

export async function evaluateAnnouncementAdminDryRunReport(params?: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<
  | { ok: true; report: AnnouncementAdminDryRunReport }
  | { ok: false; code: 'admin_unavailable' | 'query_failed' }
> {
  const env = params?.env ?? process.env
  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  let students
  try {
    students = await fetchStudentList()
  } catch {
    return { ok: false, code: 'query_failed' }
  }

  const effective = resolveEffectiveAnnouncementMode(env)
  const pushSendingEnabled = isPushSendingAvailable(env)

  const readiness = {
    recipients: students.length,
    preferenceDisabled: 0,
    pushReady: 0,
    emailFallback: 0,
    cannotDeliver: 0,
    failed: 0,
  }

  const current: AnnouncementDryRunAggregate = {
    recipients: students.length,
    preferenceDisabled: 0,
    wouldUsePush: 0,
    wouldFallbackEmail: 0,
    cannotDeliver: 0,
    failed: 0,
    mode: effective.mode,
    pushSendingEnabled,
  }

  for (const student of students) {
    const { data: prefRow, error: prefError } = await admin
      .from('notification_preferences')
      .select('announcement')
      .eq('user_id', student.id)
      .maybeSingle<{ announcement: boolean }>()

    const { data: subs, error: subError } = await admin
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', student.id)
      .is('disabled_at', null)
      .limit(1)

    const base = {
      preferenceLookupOk: !prefError,
      preferenceEnabled: prefRow
        ? Boolean(prefRow.announcement)
        : DEFAULT_NOTIFICATION_PREFERENCES.announcement,
      subscriptionLookupOk: !subError,
      hasActivePush: (subs?.length ?? 0) > 0,
      emailLookupOk: true,
      hasEmail: Boolean(student.email?.trim()),
    }

    switch (classifyAnnouncementPushReadiness(base)) {
      case 'preference_disabled':
        readiness.preferenceDisabled += 1
        break
      case 'push_ready':
        readiness.pushReady += 1
        break
      case 'email_fallback':
        readiness.emailFallback += 1
        break
      case 'cannot_deliver':
        readiness.cannotDeliver += 1
        break
      case 'failed':
        readiness.failed += 1
        break
    }

    switch (
      classifyAnnouncementDryRunFinal({
        ...base,
        pushSendingEnabled,
      })
    ) {
      case 'preference_disabled':
        current.preferenceDisabled += 1
        break
      case 'would_use_push':
        current.wouldUsePush += 1
        break
      case 'would_fallback_email':
        current.wouldFallbackEmail += 1
        break
      case 'cannot_deliver':
        current.cannotDeliver += 1
        break
      case 'failed':
        current.failed += 1
        break
    }
  }

  return { ok: true, report: { readiness, current } }
}

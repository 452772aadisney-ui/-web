/**
 * Read-only class-schedule notification readiness classifier / aggregate.
 * No sends, no event/delivery writes.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { isPushSendingAvailable } from '@/lib/push/send-config'
import { fetchStudentList } from '@/lib/study/queries'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'
import { isKisotsuGradeTag } from '@/lib/tags/grade-order'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/push'
import {
  parseClassSchedulePushAllowlist,
  resolveEffectiveClassScheduleMode,
  type ClassScheduleDeliveryMode,
} from '@/lib/class-schedule/class-schedule-delivery-mode'

export type ClassScheduleDryRunFinalBucket =
  | 'preference_disabled'
  | 'would_use_push'
  | 'would_fallback_email'
  | 'cannot_deliver'
  | 'failed'

export type ClassScheduleDryRunClassifyInput = {
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
export function classifyClassScheduleDryRunFinal(
  input: ClassScheduleDryRunClassifyInput,
): ClassScheduleDryRunFinalBucket {
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

export type ClassSchedulePushReadinessBucket =
  | 'preference_disabled'
  | 'push_ready'
  | 'email_fallback'
  | 'cannot_deliver'
  | 'failed'

/** Ignore PUSH_SENDING_ENABLED — structural readiness only. */
export function classifyClassSchedulePushReadiness(
  input: Omit<ClassScheduleDryRunClassifyInput, 'pushSendingEnabled'>,
): ClassSchedulePushReadinessBucket {
  if (!input.preferenceLookupOk) return 'failed'
  if (!input.preferenceEnabled) return 'preference_disabled'
  if (!input.subscriptionLookupOk) return 'failed'
  if (input.hasActivePush) return 'push_ready'
  if (!input.emailLookupOk) return 'failed'
  if (input.hasEmail) return 'email_fallback'
  return 'cannot_deliver'
}

export type ClassScheduleDryRunAggregate = {
  /** 学年=既卒 students only */
  kisotsuTotal: number
  preferenceEnabled: number
  preferenceDisabled: number
  pushRegistered: number
  pushNotRegistered: number
  emailFallbackable: number
  undeliverable: number
  wouldUsePush: number
  wouldFallbackEmail: number
  cannotDeliver: number
  failed: number
  mode: ClassScheduleDeliveryMode
  pushSendingEnabled: boolean
  /** Allowlist size only — never IDs */
  allowlistCount: number | null
}

async function loadKisotsuStudents(): Promise<
  | { ok: true; students: Array<{ id: string; email: string | null }> }
  | { ok: false }
> {
  try {
    const [students, gradeMap] = await Promise.all([
      fetchStudentList(),
      fetchGradeTagNamesByStudentId(),
    ])
    return {
      ok: true,
      students: students
        .filter((s) => isKisotsuGradeTag(gradeMap.get(s.id)))
        .map((s) => ({
          id: s.id,
          email: s.email?.trim() ? s.email.trim() : null,
        })),
    }
  } catch {
    return { ok: false }
  }
}

export async function evaluateClassScheduleDeliveryDryRunAggregate(params?: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<
  | { ok: true; aggregate: ClassScheduleDryRunAggregate }
  | { ok: false; code: 'admin_unavailable' | 'query_failed' }
> {
  const env = params?.env ?? process.env
  const effective = resolveEffectiveClassScheduleMode(env)
  const allowParsed = parseClassSchedulePushAllowlist(env.CLASS_SCHEDULE_PUSH_ALLOWLIST)
  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  const loaded = await loadKisotsuStudents()
  if (!loaded.ok) return { ok: false, code: 'query_failed' }

  const pushSendingEnabled = isPushSendingAvailable(env)
  const aggregate: ClassScheduleDryRunAggregate = {
    kisotsuTotal: loaded.students.length,
    preferenceEnabled: 0,
    preferenceDisabled: 0,
    pushRegistered: 0,
    pushNotRegistered: 0,
    emailFallbackable: 0,
    undeliverable: 0,
    wouldUsePush: 0,
    wouldFallbackEmail: 0,
    cannotDeliver: 0,
    failed: 0,
    mode: effective.mode,
    pushSendingEnabled,
    allowlistCount: allowParsed.ok ? allowParsed.ids.size : null,
  }

  for (const student of loaded.students) {
    const { data: prefRow, error: prefError } = await admin
      .from('notification_preferences')
      .select('class_schedule')
      .eq('user_id', student.id)
      .maybeSingle<{ class_schedule: boolean }>()

    const { data: subs, error: subError } = await admin
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', student.id)
      .is('disabled_at', null)
      .limit(1)

    const preferenceEnabled = prefRow
      ? Boolean(prefRow.class_schedule)
      : DEFAULT_NOTIFICATION_PREFERENCES.class_schedule
    const hasActivePush = (subs?.length ?? 0) > 0
    const hasEmail = Boolean(student.email)

    if (!prefError) {
      if (preferenceEnabled) aggregate.preferenceEnabled += 1
      else aggregate.preferenceDisabled += 1
    }
    if (!subError) {
      if (hasActivePush) aggregate.pushRegistered += 1
      else aggregate.pushNotRegistered += 1
    }
    if (preferenceEnabled && !hasActivePush && hasEmail) {
      aggregate.emailFallbackable += 1
    }
    if (preferenceEnabled && !hasActivePush && !hasEmail) {
      aggregate.undeliverable += 1
    }

    const input: ClassScheduleDryRunClassifyInput = {
      preferenceLookupOk: !prefError,
      preferenceEnabled,
      subscriptionLookupOk: !subError,
      hasActivePush,
      emailLookupOk: true,
      hasEmail,
      pushSendingEnabled,
    }

    switch (classifyClassScheduleDryRunFinal(input)) {
      case 'preference_disabled':
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

export type ClassScheduleAdminDryRunReport = {
  readiness: {
    kisotsuTotal: number
    preferenceDisabled: number
    pushReady: number
    emailFallback: number
    cannotDeliver: number
    failed: number
  }
  current: ClassScheduleDryRunAggregate
}

export async function evaluateClassScheduleAdminDryRunReport(params?: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<
  | { ok: true; report: ClassScheduleAdminDryRunReport }
  | { ok: false; code: 'admin_unavailable' | 'query_failed' }
> {
  const env = params?.env ?? process.env
  const admin = createAdminClient()
  if (!admin) return { ok: false, code: 'admin_unavailable' }

  const loaded = await loadKisotsuStudents()
  if (!loaded.ok) return { ok: false, code: 'query_failed' }

  const effective = resolveEffectiveClassScheduleMode(env)
  const allowParsed = parseClassSchedulePushAllowlist(env.CLASS_SCHEDULE_PUSH_ALLOWLIST)
  const pushSendingEnabled = isPushSendingAvailable(env)

  const readiness = {
    kisotsuTotal: loaded.students.length,
    preferenceDisabled: 0,
    pushReady: 0,
    emailFallback: 0,
    cannotDeliver: 0,
    failed: 0,
  }

  const current: ClassScheduleDryRunAggregate = {
    kisotsuTotal: loaded.students.length,
    preferenceEnabled: 0,
    preferenceDisabled: 0,
    pushRegistered: 0,
    pushNotRegistered: 0,
    emailFallbackable: 0,
    undeliverable: 0,
    wouldUsePush: 0,
    wouldFallbackEmail: 0,
    cannotDeliver: 0,
    failed: 0,
    mode: effective.mode,
    pushSendingEnabled,
    allowlistCount: allowParsed.ok ? allowParsed.ids.size : null,
  }

  for (const student of loaded.students) {
    const { data: prefRow, error: prefError } = await admin
      .from('notification_preferences')
      .select('class_schedule')
      .eq('user_id', student.id)
      .maybeSingle<{ class_schedule: boolean }>()

    const { data: subs, error: subError } = await admin
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', student.id)
      .is('disabled_at', null)
      .limit(1)

    const preferenceEnabled = prefRow
      ? Boolean(prefRow.class_schedule)
      : DEFAULT_NOTIFICATION_PREFERENCES.class_schedule
    const hasActivePush = (subs?.length ?? 0) > 0
    const hasEmail = Boolean(student.email)

    if (!prefError) {
      if (preferenceEnabled) current.preferenceEnabled += 1
      else current.preferenceDisabled += 1
    }
    if (!subError) {
      if (hasActivePush) current.pushRegistered += 1
      else current.pushNotRegistered += 1
    }
    if (preferenceEnabled && !hasActivePush && hasEmail) {
      current.emailFallbackable += 1
    }
    if (preferenceEnabled && !hasActivePush && !hasEmail) {
      current.undeliverable += 1
    }

    const base = {
      preferenceLookupOk: !prefError,
      preferenceEnabled,
      subscriptionLookupOk: !subError,
      hasActivePush,
      emailLookupOk: true,
      hasEmail,
    }

    switch (classifyClassSchedulePushReadiness(base)) {
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
      classifyClassScheduleDryRunFinal({
        ...base,
        pushSendingEnabled,
      })
    ) {
      case 'preference_disabled':
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

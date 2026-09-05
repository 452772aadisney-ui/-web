/**
 * Read-only message notification readiness (all students).
 * Actual recipients are only known at send time; this is structural readiness.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { isPushSendingAvailable } from '@/lib/push/send-config'
import { fetchStudentList } from '@/lib/study/queries'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/push'
import {
  resolveEffectiveMessageMode,
  type MessageDeliveryMode,
} from '@/lib/chat/message-delivery-mode'

export type MessageDryRunFinalBucket =
  | 'preference_disabled'
  | 'would_use_push'
  | 'would_fallback_email'
  | 'cannot_deliver'
  | 'failed'

export type MessageDryRunClassifyInput = {
  preferenceLookupOk: boolean
  preferenceEnabled: boolean
  subscriptionLookupOk: boolean
  hasActivePush: boolean
  emailLookupOk: boolean
  hasEmail: boolean
  pushSendingEnabled: boolean
}

export function classifyMessageDryRunFinal(
  input: MessageDryRunClassifyInput,
): MessageDryRunFinalBucket {
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

export type MessagePushReadinessBucket =
  | 'preference_disabled'
  | 'push_ready'
  | 'email_fallback'
  | 'cannot_deliver'
  | 'failed'

export function classifyMessagePushReadiness(
  input: Omit<MessageDryRunClassifyInput, 'pushSendingEnabled'>,
): MessagePushReadinessBucket {
  if (!input.preferenceLookupOk) return 'failed'
  if (!input.preferenceEnabled) return 'preference_disabled'
  if (!input.subscriptionLookupOk) return 'failed'
  if (input.hasActivePush) return 'push_ready'
  if (!input.emailLookupOk) return 'failed'
  if (input.hasEmail) return 'email_fallback'
  return 'cannot_deliver'
}

export type MessageDryRunAggregate = {
  recipients: number
  preferenceDisabled: number
  wouldUsePush: number
  wouldFallbackEmail: number
  cannotDeliver: number
  failed: number
  mode: MessageDeliveryMode
  pushSendingEnabled: boolean
}

export type MessageAdminDryRunReport = {
  /** Structural readiness ignoring PUSH_SENDING_ENABLED. */
  readiness: {
    recipients: number
    preferenceDisabled: number
    pushReady: number
    emailFallback: number
    cannotDeliver: number
    failed: number
  }
  /** Current effective path using mode + Push flag. */
  current: MessageDryRunAggregate
  notice: 'all_students_readiness_actual_recipient_at_send_time'
}

export async function evaluateMessageAdminDryRunReport(params?: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<
  | { ok: true; report: MessageAdminDryRunReport }
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

  const effective = resolveEffectiveMessageMode(env)
  const pushSendingEnabled = isPushSendingAvailable(env)

  const readiness = {
    recipients: students.length,
    preferenceDisabled: 0,
    pushReady: 0,
    emailFallback: 0,
    cannotDeliver: 0,
    failed: 0,
  }

  const current: MessageDryRunAggregate = {
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
      .select('message')
      .eq('user_id', student.id)
      .maybeSingle<{ message: boolean }>()

    const { data: subs, error: subError } = await admin
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', student.id)
      .is('disabled_at', null)
      .limit(1)

    const base = {
      preferenceLookupOk: !prefError,
      preferenceEnabled: prefRow
        ? Boolean(prefRow.message)
        : DEFAULT_NOTIFICATION_PREFERENCES.message,
      subscriptionLookupOk: !subError,
      hasActivePush: (subs?.length ?? 0) > 0,
      emailLookupOk: true,
      hasEmail: Boolean(student.email?.trim()),
    }

    switch (classifyMessagePushReadiness(base)) {
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
      classifyMessageDryRunFinal({
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

  return {
    ok: true,
    report: {
      readiness,
      current,
      notice: 'all_students_readiness_actual_recipient_at_send_time',
    },
  }
}

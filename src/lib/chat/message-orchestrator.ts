import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  resolveEffectiveMessageMode,
  type MessageDeliveryMode,
} from '@/lib/chat/message-delivery-mode'
import {
  classifyMessageDryRunFinal,
  type MessageDryRunFinalBucket,
} from '@/lib/chat/message-dry-run'
import { processMessageNewPath, type MessageNewPathOutcome } from '@/lib/chat/message-new-path'
import { sendStudentMessageEmail } from '@/lib/chat/message-email'
import { isPushSendingAvailable } from '@/lib/push/send-config'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/push'
import type { ChatMessageKind } from '@/types/chat'

export type MessageDeliverySummary = {
  ok: boolean
  mode: MessageDeliveryMode
  /** Student-facing path only; admin fanout is out of scope. */
  skippedReason:
    | null
    | 'not_student_recipient'
    | 'self_send'
    | 'excluded_kind'
    | 'missing_message_id'
  pushSucceeded: number
  emailFallbackSucceeded: number
  preferenceDisabled: number
  cannotDeliver: number
  failed: number
  legacyEmailSent: boolean
  alreadyCompleted: number
  nonProductionSkip: number
  /** dry-run only */
  wouldUsePushFirst?: boolean
  wouldFallbackToEmail?: boolean
  forcedLegacyReason?: 'allowlist_empty' | 'allowlist_invalid' | null
}

function emptySummary(
  mode: MessageDeliveryMode,
  forcedLegacyReason: MessageDeliverySummary['forcedLegacyReason'],
): MessageDeliverySummary {
  return {
    ok: true,
    mode,
    skippedReason: null,
    pushSucceeded: 0,
    emailFallbackSucceeded: 0,
    preferenceDisabled: 0,
    cannotDeliver: 0,
    failed: 0,
    legacyEmailSent: false,
    alreadyCompleted: 0,
    nonProductionSkip: 0,
    forcedLegacyReason,
  }
}

function tallyOutcome(summary: MessageDeliverySummary, outcome: MessageNewPathOutcome) {
  switch (outcome) {
    case 'push_sent':
      summary.pushSucceeded += 1
      break
    case 'email_sent':
      summary.emailFallbackSucceeded += 1
      break
    case 'preference_disabled':
      summary.preferenceDisabled += 1
      break
    case 'already_completed':
      summary.alreadyCompleted += 1
      break
    case 'in_progress':
    case 'stale_pending':
      summary.failed += 1
      break
    case 'email_failed':
      summary.failed += 1
      break
    case 'undeliverable':
      summary.cannotDeliver += 1
      break
    case 'non_production_skip':
      summary.nonProductionSkip += 1
      break
    case 'failed':
      summary.failed += 1
      break
  }
}

async function loadStudentEmail(studentId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', studentId)
    .maybeSingle<{ email: string }>()
  const email = data?.email?.trim()
  return email || null
}

async function classifyOneDryRun(
  studentId: string,
  email: string | null,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Promise<MessageDryRunFinalBucket> {
  const admin = createAdminClient()
  if (!admin) return 'failed'

  const { data: prefRow, error: prefError } = await admin
    .from('notification_preferences')
    .select('message')
    .eq('user_id', studentId)
    .maybeSingle<{ message: boolean }>()

  const { data: subs, error: subError } = await admin
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', studentId)
    .is('disabled_at', null)
    .limit(1)

  return classifyMessageDryRunFinal({
    preferenceLookupOk: !prefError,
    preferenceEnabled: prefRow
      ? Boolean(prefRow.message)
      : DEFAULT_NOTIFICATION_PREFERENCES.message,
    subscriptionLookupOk: !subError,
    hasActivePush: (subs?.length ?? 0) > 0,
    emailLookupOk: true,
    hasEmail: Boolean(email),
    pushSendingEnabled: isPushSendingAvailable(env),
  })
}

/**
 * Deliver student-facing notification for one saved chat message.
 * Admin/instructor fanout is handled separately and unaffected by MESSAGE_DELIVERY_MODE.
 */
export async function deliverStudentMessageNotification(input: {
  messageId: string
  studentId: string
  senderId: string
  senderRole: 'student' | 'admin'
  messageKind: ChatMessageKind
  body: string
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
}): Promise<MessageDeliverySummary> {
  const env = input.env ?? process.env
  const effective = resolveEffectiveMessageMode(env)
  const summary = emptySummary(effective.mode, effective.forcedLegacyReason)

  if (!input.messageId) {
    summary.ok = false
    summary.skippedReason = 'missing_message_id'
    summary.failed = 1
    return summary
  }

  // Only admin → student normal user messages are in scope for Push-first.
  if (input.senderRole !== 'admin') {
    summary.skippedReason = 'not_student_recipient'
    return summary
  }
  if (input.senderId === input.studentId) {
    summary.skippedReason = 'self_send'
    return summary
  }
  if (input.messageKind !== 'user') {
    summary.skippedReason = 'excluded_kind'
    return summary
  }

  const email = await loadStudentEmail(input.studentId)

  if (effective.mode === 'legacy') {
    if (!email) {
      summary.cannotDeliver = 1
      return summary
    }
    const result = await sendStudentMessageEmail({ to: email, body: input.body })
    summary.legacyEmailSent = result.ok
    if (!result.ok) {
      summary.failed = 1
      summary.ok = false
    }
    return summary
  }

  if (effective.mode === 'dry-run') {
    const bucket = await classifyOneDryRun(input.studentId, email, env)
    summary.wouldUsePushFirst = bucket === 'would_use_push'
    summary.wouldFallbackToEmail = bucket === 'would_fallback_email'
    if (bucket === 'preference_disabled') summary.preferenceDisabled = 1
    if (bucket === 'cannot_deliver') summary.cannotDeliver = 1
    if (bucket === 'failed') summary.failed = 1

    if (email) {
      const result = await sendStudentMessageEmail({ to: email, body: input.body })
      summary.legacyEmailSent = result.ok
      if (!result.ok) {
        summary.failed += 1
        summary.ok = false
      }
    } else {
      summary.cannotDeliver = Math.max(summary.cannotDeliver, 1)
    }

    console.info('[message-delivery] dry-run:', {
      wouldUsePushFirst: summary.wouldUsePushFirst,
      wouldFallbackToEmail: summary.wouldFallbackToEmail,
      preferenceDisabled: summary.preferenceDisabled,
      cannotDeliver: summary.cannotDeliver,
    })
    return summary
  }

  // allowlist | all
  const useNewPath =
    effective.mode === 'all' ||
    (effective.mode === 'allowlist' &&
      effective.allowlist != null &&
      effective.allowlist.has(input.studentId.toLowerCase()))

  if (!useNewPath) {
    // allowlist miss → legacy email for this student only
    if (!email) {
      summary.cannotDeliver = 1
      return summary
    }
    const result = await sendStudentMessageEmail({ to: email, body: input.body })
    summary.legacyEmailSent = result.ok
    if (!result.ok) {
      summary.failed = 1
      summary.ok = false
    }
    return summary
  }

  const outcome = await processMessageNewPath({
    studentUserId: input.studentId,
    messageId: input.messageId,
    email,
    body: input.body,
    env,
  })
  tallyOutcome(summary, outcome)
  if (outcome === 'failed' || outcome === 'email_failed') {
    summary.ok = false
  }
  return summary
}

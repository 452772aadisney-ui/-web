import { getAppBaseUrl } from '@/lib/email/config'
import { sendEmail, type SendEmailResult } from '@/lib/email/send'

/** Fixed Push copy — lock-screen safe; never include venue/address/subject/times. */
export const CLASS_SCHEDULE_PUSH_TITLE = '受験生web'
export const CLASS_SCHEDULE_PUSH_PATH = '/dashboard/class-schedule'

export type ClassScheduleNotifyKind = 'create' | 'change' | 'cancel'

export const CLASS_SCHEDULE_PUSH_BODY_BY_KIND: Record<ClassScheduleNotifyKind, string> = {
  create: '新しい授業予定が登録されました。',
  change: '授業予定が変更されました。内容を確認してください。',
  cancel: '授業予定が中止になりました。内容を確認してください。',
}

/** Uncancel uses the change body. */
export function classSchedulePushBodyForKind(kind: ClassScheduleNotifyKind): string {
  return CLASS_SCHEDULE_PUSH_BODY_BY_KIND[kind]
}

export function buildClassScheduleEmailSubject(kind: ClassScheduleNotifyKind): string {
  return `【受験生web】${CLASS_SCHEDULE_PUSH_BODY_BY_KIND[kind]}`
}

export function buildClassScheduleEmailText(kind: ClassScheduleNotifyKind): string {
  const url = `${getAppBaseUrl()}${CLASS_SCHEDULE_PUSH_PATH}`
  return [CLASS_SCHEDULE_PUSH_BODY_BY_KIND[kind], '', `確認する: ${url}`].join('\n')
}

/**
 * Idempotency key for notification_events (no PII / venue / times).
 * kind: create | change | cancel
 */
export function classScheduleIdempotencyKey(params: {
  dayId: string
  notifyRevision: number
  kind: ClassScheduleNotifyKind
}): string {
  return `class_schedule:${params.dayId}:r${params.notifyRevision}:${params.kind}`
}

/** Single-recipient class-schedule email fallback (paced + safe logs). */
export async function sendClassScheduleFallbackEmail(params: {
  to: string
  kind: ClassScheduleNotifyKind
  deadlineMs?: number
}): Promise<SendEmailResult & { httpStatus?: number | null }> {
  return sendEmail({
    to: params.to,
    subject: buildClassScheduleEmailSubject(params.kind),
    text: buildClassScheduleEmailText(params.kind),
    omitRecipientFromLogs: true,
    pace: true,
    deadlineMs: params.deadlineMs,
  })
}

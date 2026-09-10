import { getAppBaseUrl } from '@/lib/email/config'
import { sendEmail, type SendEmailResult } from '@/lib/email/send'

export const COACHING_REMINDER_PUSH_TITLE = '受験生web'
export const COACHING_REMINDER_PUSH_PATH = '/dashboard/coaching'

export const BOOKING_PROMPT_PUSH_BODY = '今週のコーチングを予約してください。'
export const BOOKING_PROMPT_EMAIL_SUBJECT = '今週のコーチングを予約してください'
export const BOOKING_PROMPT_EMAIL_BODY =
  '受験生webから今週のコーチングを予約してください。'

export const SESSION_PREVIOUS_DAY_EMAIL_SUBJECT = '明日のコーチングのお知らせ'

export const ADMIN_RESCHEDULE_PUSH_BODY =
  'コーチングの予約が変更されました。内容を確認してください。'
export const ADMIN_RESCHEDULE_EMAIL_SUBJECT = 'コーチングの予約が変更されました'

export function sessionPreviousDayPushBody(hm: string): string {
  return `明日${hm}からコーチングです。`
}

export function sessionPreviousDayEmailBody(hm: string): string {
  return `明日${hm}からコーチングです。`
}

export function adminRescheduleEmailBody(coachName: string, datetimeLabel: string): string {
  return `コーチングの予約が変更されました。\n担当: ${coachName}\n日時: ${datetimeLabel}`
}

/** Persisted schedule_revision UUID written on each successful reschedule. */
export function adminRescheduleIdempotencyKey(
  bookingId: string,
  changeRevision: string,
): string {
  return `admin-reschedule:${bookingId}:${changeRevision}`
}

/** Monday JST date of the target week. */
export function bookingPromptIdempotencyKey(weekMondayKey: string): string {
  return `booking-prompt:${weekMondayKey}`
}

export function sessionPreviousDayIdempotencyKey(
  bookingId: string,
  normalizedStartAt: string,
): string {
  return `session-previous-day:${bookingId}:${normalizedStartAt}`
}

function ctaBlock(): string {
  const url = `${getAppBaseUrl()}${COACHING_REMINDER_PUSH_PATH}`
  return [`コーチングを確認する: ${url}`].join('\n')
}

export async function sendBookingPromptEmail(params: {
  to: string
  deadlineMs?: number
}): Promise<SendEmailResult & { httpStatus?: number | null }> {
  return sendEmail({
    to: params.to,
    subject: BOOKING_PROMPT_EMAIL_SUBJECT,
    text: [BOOKING_PROMPT_EMAIL_BODY, '', ctaBlock()].join('\n'),
    omitRecipientFromLogs: true,
    pace: true,
    deadlineMs: params.deadlineMs,
  })
}

export async function sendSessionPreviousDayEmail(params: {
  to: string
  hm: string
  deadlineMs?: number
}): Promise<SendEmailResult & { httpStatus?: number | null }> {
  return sendEmail({
    to: params.to,
    subject: SESSION_PREVIOUS_DAY_EMAIL_SUBJECT,
    text: [sessionPreviousDayEmailBody(params.hm), '', ctaBlock()].join('\n'),
    omitRecipientFromLogs: true,
    pace: true,
    deadlineMs: params.deadlineMs,
  })
}

export async function sendAdminRescheduleEmail(params: {
  to: string
  coachName: string
  datetimeLabel: string
  deadlineMs?: number
  /** Same Resend Idempotency-Key for retries of this notification (24h window). */
  idempotencyKey?: string
}): Promise<SendEmailResult & { httpStatus?: number | null }> {
  return sendEmail({
    to: params.to,
    subject: ADMIN_RESCHEDULE_EMAIL_SUBJECT,
    text: [
      adminRescheduleEmailBody(params.coachName, params.datetimeLabel),
      '',
      ctaBlock(),
    ].join('\n'),
    omitRecipientFromLogs: true,
    pace: true,
    deadlineMs: params.deadlineMs,
    idempotencyKey: params.idempotencyKey,
  })
}

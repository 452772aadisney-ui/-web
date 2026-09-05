import { getAppBaseUrl } from '@/lib/email/config'
import { sendEmail, type SendEmailResult } from '@/lib/email/send'

export const COACHING_REMINDER_PUSH_TITLE = '受験生web'
export const COACHING_REMINDER_PUSH_PATH = '/dashboard/coaching'

export const BOOKING_PROMPT_PUSH_BODY = '今週のコーチングを予約してください。'
export const BOOKING_PROMPT_EMAIL_SUBJECT = '今週のコーチングを予約してください'
export const BOOKING_PROMPT_EMAIL_BODY =
  '受験生webから今週のコーチングを予約してください。'

export const SESSION_PREVIOUS_DAY_EMAIL_SUBJECT = '明日のコーチングのお知らせ'

export function sessionPreviousDayPushBody(hm: string): string {
  return `明日${hm}からコーチングです。`
}

export function sessionPreviousDayEmailBody(hm: string): string {
  return `明日${hm}からコーチングです。`
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

import { getAppBaseUrl } from '@/lib/email/config'
import { sendEmail, type SendEmailResult } from '@/lib/email/send'

/** Fixed Push copy — lock-screen safe; never include announcement body or PII. */
export const ANNOUNCEMENT_PUSH_TITLE = '受験生web'
export const ANNOUNCEMENT_PUSH_BODY = '新しいお知らせが届きました。'
export const ANNOUNCEMENT_PUSH_PATH = '/dashboard/announcements'

export function buildAnnouncementEmailSubject(title: string): string {
  return `【受験生web】新しいお知らせ: ${title}`
}

/** Legacy email body (title + deep link; body text intentionally omitted). */
export function buildAnnouncementEmailText(params: {
  title: string
  announcementId: string
}): string {
  const url = `${getAppBaseUrl()}/dashboard/announcements/${params.announcementId}`
  return [
    '新しいお知らせが配信されました。',
    '',
    params.title,
    '',
    `確認する: ${url}`,
  ].join('\n')
}

/** Idempotency key for notification_events (scoped by notification_type). */
export function announcementIdempotencyKey(announcementId: string): string {
  return `announcement:${announcementId}`
}

/** Single-recipient announcement email fallback (paced + safe logs). */
export async function sendAnnouncementFallbackEmail(params: {
  to: string
  title: string
  announcementId: string
  deadlineMs?: number
}): Promise<SendEmailResult & { httpStatus?: number | null }> {
  return sendEmail({
    to: params.to,
    subject: buildAnnouncementEmailSubject(params.title),
    text: buildAnnouncementEmailText({
      title: params.title,
      announcementId: params.announcementId,
    }),
    omitRecipientFromLogs: true,
    pace: true,
    deadlineMs: params.deadlineMs,
  })
}

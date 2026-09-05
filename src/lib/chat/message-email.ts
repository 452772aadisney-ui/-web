import { getAppBaseUrl } from '@/lib/email/config'
import { sendEmail, type SendEmailResult } from '@/lib/email/send'

/** Fixed Push copy — lock-screen safe; never include message body or PII. */
export const MESSAGE_PUSH_TITLE = '受験生web'
export const MESSAGE_PUSH_BODY = '新しいメッセージが届きました。'
/** Student has a single admin thread; room URL is safe and stable. */
export const MESSAGE_PUSH_PATH = '/dashboard/chat/room'
/**
 * OS notification tag: one thread per student device with admin.
 * No user IDs — consecutive admin messages replace each other on-device.
 */
export const MESSAGE_PUSH_TAG = 'chat-message'

export const MESSAGE_EMAIL_SUBJECT = '【受験生web】管理者からメッセージが届きました'

export function messageIdempotencyKey(messageId: string): string {
  return `message:${messageId}`
}

export function truncateMessagePreview(text: string, maxLength = 120): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}…`
}

/** Existing student-facing email copy (preview retained by design). */
export function buildStudentMessageEmailText(body: string): string {
  const preview = truncateMessagePreview(body)
  const url = `${getAppBaseUrl()}${MESSAGE_PUSH_PATH}`
  return [
    '管理者から新しいメッセージが届きました。',
    '',
    preview,
    '',
    `確認する: ${url}`,
  ].join('\n')
}

/** Single-recipient paced email (student-facing). */
export async function sendStudentMessageEmail(params: {
  to: string
  body: string
}): Promise<SendEmailResult & { httpStatus?: number | null }> {
  return sendEmail({
    to: params.to,
    subject: MESSAGE_EMAIL_SUBJECT,
    text: buildStudentMessageEmailText(params.body),
    omitRecipientFromLogs: true,
    pace: true,
  })
}

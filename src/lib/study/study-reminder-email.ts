import { getAppBaseUrl } from '@/lib/email/config'
import { sendEmail, type SendEmailResult } from '@/lib/email/send'

export const STUDY_REMINDER_PUSH_TITLE = '受験生web'
export const STUDY_REMINDER_PUSH_BODY = '今日の学習記録を忘れていませんか？'
export const STUDY_REMINDER_PUSH_PATH = '/dashboard/study'

export const STUDY_REMINDER_EMAIL_SUBJECT = '【受験生web】本日の学習記録が未入力です'

export function buildMissingStudyLogEmailText(dateLabel: string): string {
  const url = `${getAppBaseUrl()}/dashboard/study`
  return [
    '本日（' + dateLabel + '）の学習記録がまだ登録されていません。',
    '忘れずに記録してください。',
    '',
    `記録する: ${url}`,
  ].join('\n')
}

/** Single-recipient study-reminder email (safe logs; no address in log lines). */
export async function sendMissingStudyLogEmail(params: {
  to: string
  dateLabel: string
}): Promise<SendEmailResult & { httpStatus?: number | null }> {
  const result = await sendEmail({
    to: params.to,
    subject: STUDY_REMINDER_EMAIL_SUBJECT,
    text: buildMissingStudyLogEmailText(params.dateLabel),
    omitRecipientFromLogs: true,
  })
  return result
}

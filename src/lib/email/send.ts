import { getEmailFrom } from '@/lib/email/config'
import {
  classifyResendHttpStatus,
  withResendSendPace,
} from '@/lib/email/rate-limit'

export type SendEmailInput = {
  to: string
  subject: string
  text: string
  replyTo?: string
  /** When true, failure logs omit recipient address (cron / study-reminder path). */
  omitRecipientFromLogs?: boolean
  /**
   * When true, wait on the shared Resend pace queue before sending.
   * Use for study-reminder Cron paths so parallel workers cannot burst.
   */
  pace?: boolean
  /** Absolute epoch ms; paced sends after this are skipped (soft timeout). */
  deadlineMs?: number
}

export type SendEmailResult =
  | { ok: true; httpStatus?: number }
  | {
      ok: false
      skipped?: boolean
      error?: string
      httpStatus?: number | null
      errorClass?:
        | 'rate_limited'
        | 'provider_error'
        | 'network'
        | 'empty_recipient'
        | 'deadline'
    }

function formatResendError(raw: string, to: string): string {
  try {
    const parsed = JSON.parse(raw) as { message?: string; statusCode?: number }
    const message = parsed.message ?? raw

    if (parsed.statusCode === 403 && message.includes('only send testing emails to your own email address')) {
      const match = message.match(/\(([^(]+)\)/)
      const allowedEmail = match?.[1]?.trim()
      return [
        'Resend のテストモードでは、Resend 登録メール宛にしか送れません。',
        allowedEmail ? `送れるアドレス: ${allowedEmail}` : null,
        `今回の送信先: ${to}`,
        '管理者または生徒の profiles.email を Resend 登録メールに合わせるか、本番用にドメイン認証してください。',
      ]
        .filter(Boolean)
        .join(' ')
    }

    return message
  } catch {
    return raw
  }
}

async function sendEmailOnce(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = getEmailFrom()

  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY or EMAIL_FROM is not configured; email skipped')
    return { ok: false, skipped: true }
  }

  const to = input.to.trim()
  if (!to) {
    return { ok: false, error: 'Recipient email is empty', errorClass: 'empty_recipient' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: input.subject,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    })

    if (!response.ok) {
      const errorClass = classifyResendHttpStatus(response.status)
      const errorBody = await response.text().catch(() => '')

      if (input.omitRecipientFromLogs) {
        console.error('[email] send failed:', {
          status: response.status,
          errorClass,
        })
        return {
          ok: false,
          error: errorClass,
          httpStatus: response.status,
          errorClass,
        }
      }

      console.error('[email] send failed:', {
        status: response.status,
        errorClass,
      })
      return {
        ok: false,
        error: formatResendError(errorBody || `HTTP ${response.status}`, to),
        httpStatus: response.status,
        errorClass,
      }
    }

    return { ok: true, httpStatus: response.status }
  } catch {
    if (input.omitRecipientFromLogs) {
      console.error('[email] send failed:', { errorClass: 'network' })
      return { ok: false, error: 'network', errorClass: 'network' }
    }
    console.error('[email] send error: network')
    return { ok: false, error: 'network', errorClass: 'network' }
  }
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (
    input.deadlineMs != null &&
    Date.now() >= input.deadlineMs
  ) {
    return { ok: false, skipped: true, error: 'deadline', errorClass: 'deadline' }
  }

  if (input.pace) {
    return withResendSendPace(async () => {
      if (input.deadlineMs != null && Date.now() >= input.deadlineMs) {
        return { ok: false, skipped: true, error: 'deadline', errorClass: 'deadline' }
      }
      return sendEmailOnce(input)
    })
  }
  return sendEmailOnce(input)
}

export type SendEmailToManyResult = {
  recipientCount: number
  sentCount: number
  skippedCount: number
  failedCount: number
  rateLimitedCount: number
  /** Recipients not attempted because soft deadline was reached. */
  unprocessedCount: number
  timedOut: boolean
}

/**
 * Send the same message to many recipients.
 * When `pace` is true (study-reminder), sends are strictly sequential with
 * {@link RESEND_SEND_MIN_INTERVAL_MS} between starts — never a 1-second burst.
 */
export async function sendEmailToMany(
  recipients: string[],
  input: Omit<SendEmailInput, 'to'>,
  options?: {
    omitRecipientFromLogs?: boolean
    pace?: boolean
    /** Soft stop before Vercel hard kill; remaining recipients become unprocessed. */
    deadlineMs?: number
  },
): Promise<SendEmailToManyResult> {
  const uniqueRecipients = [...new Set(recipients.map((email) => email.trim()).filter(Boolean))]
  if (uniqueRecipients.length === 0) {
    console.warn('[email] skipped: recipient list is empty')
    return {
      recipientCount: 0,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
      rateLimitedCount: 0,
      unprocessedCount: 0,
      timedOut: false,
    }
  }

  const results: SendEmailResult[] = []
  let unprocessedCount = 0
  let timedOut = false
  const deadlineMs = options?.deadlineMs ?? input.deadlineMs

  if (options?.pace || input.pace) {
    for (let i = 0; i < uniqueRecipients.length; i += 1) {
      if (deadlineMs != null && Date.now() >= deadlineMs) {
        timedOut = true
        unprocessedCount = uniqueRecipients.length - i
        break
      }
      const to = uniqueRecipients[i]!
      const result = await sendEmail({
        to,
        subject: input.subject,
        text: input.text,
        replyTo: input.replyTo,
        omitRecipientFromLogs: options?.omitRecipientFromLogs ?? input.omitRecipientFromLogs,
        pace: true,
        deadlineMs,
      })
      if (!result.ok && result.errorClass === 'deadline') {
        timedOut = true
        unprocessedCount = uniqueRecipients.length - i
        break
      }
      results.push(result)
    }
  } else {
    // Non-paced callers (announcements etc.) keep previous parallel behavior.
    const parallel = await Promise.all(
      uniqueRecipients.map((to) =>
        sendEmail({
          to,
          subject: input.subject,
          text: input.text,
          replyTo: input.replyTo,
          omitRecipientFromLogs: options?.omitRecipientFromLogs,
        }),
      ),
    )
    results.push(...parallel)
  }

  const sentCount = results.filter((result) => result.ok).length
  const skippedCount = results.filter(
    (result) => !result.ok && result.skipped && result.errorClass !== 'deadline',
  ).length
  const rateLimitedCount = results.filter(
    (result) => !result.ok && result.errorClass === 'rate_limited',
  ).length
  const failedCount = results.length - sentCount - skippedCount

  console.info('[email] batch result:', {
    recipients: uniqueRecipients.length,
    sent: sentCount,
    skipped: skippedCount,
    failed: failedCount,
    rateLimited: rateLimitedCount,
    unprocessed: unprocessedCount,
    timedOut,
  })

  return {
    recipientCount: uniqueRecipients.length,
    sentCount,
    skippedCount,
    failedCount,
    rateLimitedCount,
    unprocessedCount,
    timedOut,
  }
}


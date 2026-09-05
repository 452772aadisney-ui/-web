import { getEmailFrom } from '@/lib/email/config'

export type SendEmailInput = {
  to: string
  subject: string
  text: string
  replyTo?: string
  /** When true, failure logs omit recipient address (cron / study-reminder path). */
  omitRecipientFromLogs?: boolean
}

export type SendEmailResult =
  | { ok: true; httpStatus?: number }
  | { ok: false; skipped?: boolean; error?: string; httpStatus?: number | null }

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

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = getEmailFrom()

  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY or EMAIL_FROM is not configured; email skipped')
    return { ok: false, skipped: true }
  }

  const to = input.to.trim()
  if (!to) {
    return { ok: false, error: 'Recipient email is empty' }
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
      const error = await response.text()
      if (input.omitRecipientFromLogs) {
        console.error('[email] send failed:', {
          status: response.status,
          errorClass: 'provider_error',
        })
        return { ok: false, error: 'provider_error', httpStatus: response.status }
      }
      console.error('[email] send failed:', { from, to, error })
      return { ok: false, error: formatResendError(error, to), httpStatus: response.status }
    }

    return { ok: true, httpStatus: response.status }
  } catch (error) {
    console.error('[email] send error:', error)
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function sendEmailToMany(
  recipients: string[],
  input: Omit<SendEmailInput, 'to'>,
  options?: { omitRecipientFromLogs?: boolean; concurrency?: number },
): Promise<{ recipientCount: number; sentCount: number; skippedCount: number }> {
  const uniqueRecipients = [...new Set(recipients.map((email) => email.trim()).filter(Boolean))]
  if (uniqueRecipients.length === 0) {
    console.warn('[email] skipped: recipient list is empty')
    return { recipientCount: 0, sentCount: 0, skippedCount: 0 }
  }

  const concurrency = options?.concurrency
  let results: SendEmailResult[]

  if (concurrency && concurrency > 0 && concurrency < uniqueRecipients.length) {
    results = new Array(uniqueRecipients.length)
    let nextIndex = 0
    async function worker() {
      for (;;) {
        const current = nextIndex
        nextIndex += 1
        if (current >= uniqueRecipients.length) return
        results[current] = await sendEmail({
          to: uniqueRecipients[current]!,
          subject: input.subject,
          text: input.text,
          replyTo: input.replyTo,
          omitRecipientFromLogs: options?.omitRecipientFromLogs,
        })
      }
    }
    await Promise.all(
      Array.from({ length: concurrency }, () => worker()),
    )
  } else {
    results = await Promise.all(
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
  }

  const sentCount = results.filter((result) => result.ok).length
  const skippedCount = results.filter((result) => !result.ok && result.skipped).length

  console.info('[email] batch result:', {
    recipients: uniqueRecipients.length,
    sent: sentCount,
    skipped: skippedCount,
    failed: results.length - sentCount - skippedCount,
  })

  return { recipientCount: uniqueRecipients.length, sentCount, skippedCount }
}

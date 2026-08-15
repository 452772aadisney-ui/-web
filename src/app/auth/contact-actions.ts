'use server'

import { LOGIN_CONTACT_RECIPIENT } from '@/lib/email/contact'
import { sendEmail } from '@/lib/email/send'

export type LoginContactActionState = {
  error?: string
  success?: boolean
}

export async function submitLoginContact(
  _prevState: LoginContactActionState,
  formData: FormData,
): Promise<LoginContactActionState> {
  const fullName = String(formData.get('fullName') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const message = String(formData.get('message') ?? '').trim()

  if (!fullName || !email || !message) {
    return { error: 'すべての項目を入力してください' }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'メールアドレスの形式が正しくありません' }
  }

  if (message.length > 5000) {
    return { error: '困っている内容は5000文字以内で入力してください' }
  }

  const result = await sendEmail({
    to: LOGIN_CONTACT_RECIPIENT,
    replyTo: email,
    subject: `【受験生web】ログイン画面からの問い合わせ（${fullName}）`,
    text: [
      'ログイン画面の問い合わせフォームから送信されました。',
      '',
      `氏名: ${fullName}`,
      `メールアドレス: ${email}`,
      '',
      '困っている内容:',
      message,
    ].join('\n'),
  })

  if (!result.ok && result.skipped) {
    return {
      error: '現在お問い合わせを送信できません。しばらくしてからお試しください。',
    }
  }

  if (!result.ok) {
    return { error: '送信に失敗しました。しばらくしてからお試しください。' }
  }

  return { success: true }
}

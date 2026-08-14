'use server'

import { getEmailFrom, isEmailConfigured } from '@/lib/email/config'
import { sendEmail } from '@/lib/email/send'
import { createClient } from '@/lib/supabase/server'

export type EmailTestState = {
  error?: string
  success?: string
}

export async function sendTestEmail(
  _prev: EmailTestState,
  _formData: FormData,
): Promise<EmailTestState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'ログインが必要です' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .maybeSingle<{ role: string; email: string }>()

  if (profile?.role !== 'admin') return { error: '管理者権限が必要です' }

  const to = profile.email.trim()
  if (!to) return { error: '管理者プロフィールにメールアドレスがありません' }

  if (!isEmailConfigured()) {
    return {
      error:
        'RESEND_API_KEY または EMAIL_FROM が未設定です。.env.local を確認し、npm run dev を再起動してください。',
    }
  }

  const result = await sendEmail({
    to,
    subject: '【受験生web】メール通知テスト',
    text: [
      'これは受験生webからのテストメールです。',
      '',
      'このメールが届けば Resend の設定は正常です。',
      `送信元: ${getEmailFrom()}`,
    ].join('\n'),
  })

  if (result.ok) {
    return {
      success: `${to} 宛にテストメールを送信しました。Resend の Sending タブと受信トレイを確認してください。`,
    }
  }

  if (result.skipped) {
    return { error: 'メール送信がスキップされました。環境変数を確認してください。' }
  }

  return { error: `送信に失敗しました: ${result.error ?? '不明なエラー'}` }
}

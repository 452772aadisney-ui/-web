'use client'

import { useActionState } from 'react'
import { sendTestEmail, type EmailTestState } from '@/app/admin/email-test/actions'

const initialState: EmailTestState = {}

export function EmailTestPanel(props: {
  configured: boolean
  fromAddress: string | null
  adminEmail: string
}) {
  const [state, formAction, pending] = useActionState(sendTestEmail, initialState)

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-bold">メール通知テスト</h2>
      <p className="mt-2 text-sm text-muted">
        Resend の設定確認用です。ボタンを押すと、ログイン中の管理者メール宛に1通送信します。
      </p>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-muted">設定状態</dt>
          <dd>{props.configured ? 'OK（APIキーと送信元あり）' : '未設定'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-muted">送信元</dt>
          <dd>{props.fromAddress ?? '未設定'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-muted">送信先</dt>
          <dd>{props.adminEmail}</dd>
        </div>
      </dl>

      <form action={formAction} className="mt-4">
        <button
          type="submit"
          disabled={pending || !props.configured}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? '送信中…' : 'テストメールを送信'}
        </button>
      </form>

      {state.success ? <p className="mt-3 text-sm text-green-700">{state.success}</p> : null}
      {state.error ? <p className="mt-3 text-sm text-red-600">{state.error}</p> : null}

      <p className="mt-4 text-xs text-muted">
        テスト中（onboarding@resend.dev）は Resend 登録メール宛のみ届きます。上の「送信先」が Resend
        登録メールと違うと 403 エラーになります。
      </p>
    </section>
  )
}

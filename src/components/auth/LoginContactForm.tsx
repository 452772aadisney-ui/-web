'use client'

import { useActionState } from 'react'
import { submitLoginContact, type LoginContactActionState } from '@/app/auth/contact-actions'

const initialState: LoginContactActionState = {}

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

export function LoginContactForm() {
  const [state, formAction, pending] = useActionState(submitLoginContact, initialState)

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div className="mb-6">
        <h2 className="text-lg font-bold">お問い合わせ</h2>
        <p className="mt-1 text-sm text-muted">
          ログインでお困りの場合は、こちらからご連絡ください。
        </p>
      </div>

      {state.success ? (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
          お問い合わせを送信しました。確認後、ご入力のメールアドレス宛にご連絡します。
        </p>
      ) : (
        <form action={formAction} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">氏名</span>
            <input
              type="text"
              name="fullName"
              autoComplete="name"
              required
              placeholder="山田 太郎"
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">メールアドレス</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="example@email.com"
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">困っている内容</span>
            <textarea
              name="message"
              rows={4}
              required
              placeholder="ログインできない、パスワードを忘れた など"
              className={fieldClass}
            />
          </label>

          {state.error && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-error" role="alert">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg border border-border bg-background py-2.5 font-medium transition hover:bg-card disabled:opacity-60"
          >
            {pending ? '送信中…' : '問い合わせを送信'}
          </button>
        </form>
      )}
    </div>
  )
}

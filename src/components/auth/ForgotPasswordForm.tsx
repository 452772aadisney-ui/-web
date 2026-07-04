'use client'

import { useActionState } from 'react'
import { requestPasswordReset, type AuthActionState } from '@/app/auth/actions'
import { AuthCard, AuthLink } from '@/components/auth/AuthCard'

const initialState: AuthActionState = {}

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState)

  return (
    <AuthCard
      title="パスワードを忘れた方"
      subtitle="登録したメールアドレスに再設定用のリンクを送信します"
      footer={
        <>
          <AuthLink href="/login">ログイン画面に戻る</AuthLink>
        </>
      }
    >
      {state.success ? (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
          パスワード再設定用のメールを送信しました。メール内のリンクから新しいパスワードを設定してください。
        </p>
      ) : (
        <form action={formAction} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">メールアドレス</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="example@email.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
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
            className="w-full rounded-lg bg-primary py-2.5 font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? '送信中…' : '再設定メールを送信'}
          </button>
        </form>
      )}
    </AuthCard>
  )
}

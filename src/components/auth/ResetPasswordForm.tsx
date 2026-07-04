'use client'

import { useActionState } from 'react'
import { updatePassword, type AuthActionState } from '@/app/auth/actions'
import { AuthCard, AuthLink } from '@/components/auth/AuthCard'

const initialState: AuthActionState = {}

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, initialState)

  return (
    <AuthCard
      title="新しいパスワードを設定"
      subtitle="8文字以上の新しいパスワードを入力してください"
      footer={
        <>
          <AuthLink href="/login">ログイン画面に戻る</AuthLink>
        </>
      }
    >
      <form action={formAction} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">新しいパスワード</span>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="8文字以上"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">新しいパスワード（確認）</span>
          <input
            type="password"
            name="passwordConfirm"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="もう一度入力"
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
          {pending ? '更新中…' : 'パスワードを更新'}
        </button>
      </form>
    </AuthCard>
  )
}

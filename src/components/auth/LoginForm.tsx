'use client'

import { useActionState } from 'react'
import { signIn, type AuthActionState } from '@/app/auth/actions'
import { AuthCard, AuthLink } from '@/components/auth/AuthCard'

const initialState: AuthActionState = {}

export function LoginForm({ registered }: { registered?: boolean }) {
  const [state, formAction, pending] = useActionState(signIn, initialState)

  return (
    <AuthCard
      title="受験生web"
      subtitle="メールアドレスとパスワードでログイン"
      footer={
        <>
          アカウントをお持ちでない方は <AuthLink href="/signup">新規登録</AuthLink>
        </>
      }
    >
      {registered && (
        <p className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
          アカウントを作成しました。ログインしてください。
        </p>
      )}

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

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">パスワード</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            placeholder="パスワード"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <p className="text-right text-sm">
          <AuthLink href="/forgot-password">パスワードを忘れた方</AuthLink>
        </p>

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
          {pending ? 'ログイン中…' : 'ログイン'}
        </button>
      </form>
    </AuthCard>
  )
}

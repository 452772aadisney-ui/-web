'use client'

import { useActionState } from 'react'
import { signUp, type AuthActionState } from '@/app/auth/actions'
import { AuthCard, AuthLink } from '@/components/auth/AuthCard'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { GRADE_TAG_NAMES } from '@/lib/tags/grade-order'

const initialState: AuthActionState = {}

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUp, initialState)

  return (
    <AuthCard
      title="新規登録"
      subtitle="受験生web アカウントを作成"
      footer={
        <>
          すでにアカウントをお持ちの方は <AuthLink href="/login">ログイン</AuthLink>
        </>
      }
    >
      <form action={formAction} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">氏名</span>
          <input
            type="text"
            name="fullName"
            autoComplete="name"
            required
            placeholder="山田 太郎"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <fieldset className="block">
          <legend className="mb-2 text-sm font-medium">学年</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {GRADE_TAG_NAMES.map((grade) => (
              <label
                key={grade}
                className="flex cursor-pointer items-center justify-center rounded-lg border border-border bg-background px-3 py-2.5 text-sm has-checked:border-primary has-checked:bg-primary/5"
              >
                <input
                  type="radio"
                  name="gradeTagName"
                  value={grade}
                  required
                  className="sr-only"
                />
                {grade}
              </label>
            ))}
          </div>
        </fieldset>

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

        <PasswordInput
          name="password"
          label="パスワード"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="8文字以上"
        />

        <PasswordInput
          name="passwordConfirm"
          label="パスワード（確認）"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="もう一度入力"
        />

        <p className="text-xs text-muted">
          新規登録は「生徒」ロールで作成されます。管理者アカウントは運営側で付与します。
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
          {pending ? '登録中…' : 'アカウントを作成'}
        </button>
      </form>
    </AuthCard>
  )
}

'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveGradeTagId } from '@/lib/tags/queries'
import { isGradeTagName } from '@/lib/tags/grade-order'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import type { Profile } from '@/types/database'

export type AuthActionState = {
  error?: string
  success?: boolean
}

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { error: 'メールアドレスとパスワードを入力してください' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'メールアドレスまたはパスワードが正しくありません' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'ログインに失敗しました' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>()

  redirect(getDashboardPathForRole(profile?.role ?? 'student'))
}

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const fullName = String(formData.get('fullName') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const passwordConfirm = String(formData.get('passwordConfirm') ?? '')
  const gradeTagName = String(formData.get('gradeTagName') ?? '').trim()

  if (!fullName || !email || !password) {
    return { error: 'すべての項目を入力してください' }
  }

  if (!isGradeTagName(gradeTagName)) {
    return { error: '学年を選択してください' }
  }

  const gradeTagId = await resolveGradeTagId(gradeTagName)
  if (!gradeTagId) {
    return { error: '学年の設定に失敗しました。しばらくしてからお試しください' }
  }

  if (password.length < 8) {
    return { error: 'パスワードは8文字以上で入力してください' }
  }

  if (password !== passwordConfirm) {
    return { error: 'パスワード（確認）が一致しません' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        grade_tag_id: gradeTagId,
      },
    },
  })

  if (error) {
    if (error.message.includes('already registered')) {
      return { error: 'このメールアドレスは既に登録されています' }
    }
    return { error: 'アカウントの作成に失敗しました。しばらくしてからお試しください' }
  }

  redirect('/login?registered=1')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

async function getSiteOrigin(): Promise<string> {
  const headersList = await headers()
  const origin = headersList.get('origin')
  if (origin) return origin

  const host = headersList.get('x-forwarded-host') ?? headersList.get('host')
  const protocol = headersList.get('x-forwarded-proto') ?? 'http'
  if (host) return `${protocol}://${host}`

  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}

export async function requestPasswordReset(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim()

  if (!email) {
    return { error: 'メールアドレスを入力してください' }
  }

  const supabase = await createClient()
  const origin = await getSiteOrigin()
  const redirectTo = `${origin}/auth/callback?next=/reset-password`

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  if (error) {
    return { error: 'リセットメールの送信に失敗しました。メールアドレスを確認してください' }
  }

  return { success: true }
}

export async function updatePassword(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get('password') ?? '')
  const passwordConfirm = String(formData.get('passwordConfirm') ?? '')

  if (!password) {
    return { error: '新しいパスワードを入力してください' }
  }

  if (password.length < 8) {
    return { error: 'パスワードは8文字以上で入力してください' }
  }

  if (password !== passwordConfirm) {
    return { error: 'パスワード（確認）が一致しません' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'セッションが無効です。もう一度リセットメールからアクセスしてください' }
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { error: 'パスワードの更新に失敗しました' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<Pick<Profile, 'role'>>()

  redirect(getDashboardPathForRole(profile?.role ?? 'student'))
}

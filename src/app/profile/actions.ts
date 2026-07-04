'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EXAM_SUBJECTS } from '@/lib/constants/subjects'
import type { Profile } from '@/types/database'

export type ProfileActionState = {
  error?: string
  success?: boolean
}

function parseTargetSchools(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseSubjects(formData: FormData): string[] {
  return EXAM_SUBJECTS.filter((subject) => formData.get(`subject_${subject}`) === 'on')
}

export async function updateProfile(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'ログインが必要です' }
  }

  const fullName = String(formData.get('fullName') ?? '').trim()
  const birthdayRaw = String(formData.get('birthday') ?? '').trim()
  const targetSchoolsRaw = String(formData.get('targetSchools') ?? '')
  const subjects = parseSubjects(formData)

  if (!fullName) {
    return { error: '氏名を入力してください' }
  }

  const birthday = birthdayRaw || null

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      display_name: fullName,
      birthday,
      target_schools: parseTargetSchools(targetSchoolsRaw),
      subjects,
    })
    .eq('id', user.id)

  if (error) {
    return { error: 'プロフィールの保存に失敗しました' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/profile')
  revalidatePath('/admin/profile')

  return { success: true }
}

export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>()

  if (!profile) {
    redirect('/login')
  }

  return profile
}

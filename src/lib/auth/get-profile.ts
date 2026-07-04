import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/database'

export type ProfileResult =
  | { profile: Profile; error: null }
  | { profile: null; error: string }

function normalizeProfile(raw: Profile): Profile {
  return {
    ...raw,
    display_name: raw.display_name ?? raw.full_name ?? '',
    target_schools: raw.target_schools ?? [],
    subjects: raw.subjects ?? [],
  }
}

async function ensureUserProfile(user: {
  id: string
  email?: string
  user_metadata?: Record<string, unknown>
}): Promise<ProfileResult> {
  const supabase = await createClient()
  const fullName = String(user.user_metadata?.full_name ?? '')

  const { data: created, error } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      email: user.email ?? '',
      full_name: fullName,
      display_name: fullName,
      role: 'student',
    })
    .select('*')
    .single<Profile>()

  if (error) {
    return { profile: null, error: error.message }
  }

  if (!created) {
    return { profile: null, error: 'プロフィールの作成に失敗しました' }
  }

  return { profile: normalizeProfile(created), error: null }
}

export async function getCurrentProfileWithError(): Promise<ProfileResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { profile: null, error: 'ログインしていません' }
  }

  const { data: profile, error: selectError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle<Profile>()

  if (selectError) {
    return { profile: null, error: selectError.message }
  }

  if (profile) {
    return { profile: normalizeProfile(profile), error: null }
  }

  return ensureUserProfile(user)
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const { profile } = await getCurrentProfileWithError()
  return profile
}

export { getDashboardPathForRole } from '@/lib/auth/routes'

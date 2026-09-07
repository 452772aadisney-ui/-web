import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { isKisotsuGradeTag } from '@/lib/tags/grade-order'
import { fetchGradeTagNameForProfile } from '@/lib/tags/queries'
import type { Profile } from '@/types/database'

export type AccessResult =
  | { ok: true; profile: Profile }
  | { ok: false; error: string }

export async function requireAdmin(): Promise<AccessResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'ログインが必要です' }
  if (profile.role !== 'admin') return { ok: false, error: '管理者権限が必要です' }
  return { ok: true, profile }
}

export async function requireKisotsuStudent(): Promise<AccessResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'ログインが必要です' }
  if (profile.role !== 'student') {
    return { ok: false, error: '生徒のみ利用できます' }
  }
  const gradeTagName = await fetchGradeTagNameForProfile(profile.id)
  if (!isKisotsuGradeTag(gradeTagName)) {
    return { ok: false, error: '既卒生のみ利用できます' }
  }
  return { ok: true, profile }
}

/** Page guard: redirect non-kisotsu students (and non-students) away. */
export async function requireKisotsuStudentOrRedirect(): Promise<Profile> {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'student') redirect(getDashboardPathForRole(profile.role))
  const gradeTagName = await fetchGradeTagNameForProfile(profile.id)
  if (!isKisotsuGradeTag(gradeTagName)) redirect('/dashboard')
  return profile
}

export async function requireAdminOrRedirect(): Promise<Profile> {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))
  return profile
}

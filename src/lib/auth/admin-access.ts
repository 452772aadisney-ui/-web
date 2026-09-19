import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { createClient } from '@/lib/supabase/server'
import { KISOTSU_GRADE_TAG } from '@/lib/tags/grade-order'
import type { Profile } from '@/types/database'

export type AdminAccessOk = {
  ok: true
  profile: Profile
  isSuperAdmin: boolean
}

export type AdminAccessResult = AdminAccessOk | { ok: false; error: string }

/** Uniform denial that does not reveal whether a graduate id exists. */
export const ADMIN_STUDENT_NOT_FOUND = '対象が見つかりません'

export function isSuperAdminProfile(
  profile: Pick<Profile, 'role' | 'is_super_admin'> | null | undefined,
): boolean {
  return profile?.role === 'admin' && Boolean(profile.is_super_admin)
}

export async function requireAdminAccess(): Promise<AdminAccessResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'ログインが必要です' }
  if (profile.role !== 'admin') return { ok: false, error: '管理者権限が必要です' }
  return {
    ok: true,
    profile,
    isSuperAdmin: isSuperAdminProfile(profile),
  }
}

export async function requireSuperAdminAccess(): Promise<AdminAccessResult> {
  const access = await requireAdminAccess()
  if (!access.ok) return access
  if (!access.isSuperAdmin) {
    return { ok: false, error: '大管理者権限が必要です' }
  }
  return access
}

export async function requireAdminOrRedirect(): Promise<Profile> {
  const access = await requireAdminAccess()
  if (!access.ok) {
    if (access.error === 'ログインが必要です') redirect('/login')
    redirect(getDashboardPathForRole('student'))
  }
  return access.profile
}

export async function requireSuperAdminOrRedirect(): Promise<Profile> {
  const access = await requireSuperAdminAccess()
  if (!access.ok) {
    if (access.error === 'ログインが必要です') redirect('/login')
    redirect('/admin')
  }
  return access.profile
}

/**
 * Resolve 既卒 student ids among the given ids (for admin-session filtering).
 * Uses user-scoped client; RLS still applies.
 */
export async function fetchKisotsuStudentIdSet(
  studentIds: string[],
): Promise<Set<string>> {
  const unique = [...new Set(studentIds.filter(Boolean))]
  if (unique.length === 0) return new Set()

  const supabase = await createClient()
  const { data: tag } = await supabase
    .from('student_tags')
    .select('id')
    .eq('category', '学年')
    .eq('name', KISOTSU_GRADE_TAG)
    .maybeSingle<{ id: string }>()

  if (!tag?.id) return new Set()

  const { data } = await supabase
    .from('profile_student_tags')
    .select('profile_id')
    .eq('tag_id', tag.id)
    .in('profile_id', unique)

  return new Set((data ?? []).map((row) => row.profile_id as string))
}

export async function fetchAllKisotsuStudentIds(): Promise<string[]> {
  const supabase = await createClient()
  const { data: tag } = await supabase
    .from('student_tags')
    .select('id')
    .eq('category', '学年')
    .eq('name', KISOTSU_GRADE_TAG)
    .maybeSingle<{ id: string }>()

  if (!tag?.id) return []

  const { data } = await supabase
    .from('profile_student_tags')
    .select('profile_id')
    .eq('tag_id', tag.id)

  return (data ?? []).map((row) => row.profile_id as string)
}

/**
 * Drop 既卒 ids from a list when the actor is not a super admin.
 * Preserves input order; super admins get unique non-empty ids only.
 * Call BEFORE count/pagination when filtering list inputs.
 */
export async function filterGraduatesFromStudentIds(
  studentIds: string[],
  access: Pick<AdminAccessOk, 'isSuperAdmin'>,
): Promise<string[]> {
  const unique = [...new Set(studentIds.filter(Boolean))]
  if (access.isSuperAdmin) return unique
  if (unique.length === 0) return []
  const kisotsu = await fetchKisotsuStudentIdSet(unique)
  return unique.filter((id) => !kisotsu.has(id))
}

/**
 * Authorize access to a student id for the current admin.
 * Returns not-found style error for graduates when caller is not super.
 */
export async function assertAdminCanAccessStudent(
  studentId: string,
  access: AdminAccessOk,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!studentId) return { ok: false, error: ADMIN_STUDENT_NOT_FOUND }
  if (access.isSuperAdmin) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', studentId)
      .maybeSingle<{ id: string; role: string }>()
    if (!data || data.role !== 'student') {
      return { ok: false, error: ADMIN_STUDENT_NOT_FOUND }
    }
    return { ok: true }
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', studentId)
    .eq('role', 'student')
    .maybeSingle<{ id: string; role: string }>()

  // RLS hides 既卒 → appears as missing
  if (!data) return { ok: false, error: ADMIN_STUDENT_NOT_FOUND }
  return { ok: true }
}

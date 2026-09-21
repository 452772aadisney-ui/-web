/**
 * Student scope for admin notification dry-runs (service_role paths).
 * Cron / orchestrator dry-run modes must NOT use excludeGraduates.
 */

import { KISOTSU_GRADE_TAG } from '@/lib/tags/grade-order'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

export type AdminDryRunAudienceScope = 'all' | 'enrolled'

export function resolveAdminDryRunAudienceScope(isSuperAdmin: boolean): AdminDryRunAudienceScope {
  return isSuperAdmin ? 'all' : 'enrolled'
}

/** Resolve 既卒 profile ids via service_role (bypasses RLS). */
export async function fetchKisotsuStudentIdsViaAdmin(
  admin: AdminClient,
): Promise<Set<string>> {
  const { data: tag, error: tagError } = await admin
    .from('student_tags')
    .select('id')
    .eq('category', '学年')
    .eq('name', KISOTSU_GRADE_TAG)
    .maybeSingle<{ id: string }>()

  if (tagError || !tag?.id) return new Set()

  const { data: rows, error } = await admin
    .from('profile_student_tags')
    .select('profile_id')
    .eq('tag_id', tag.id)

  if (error) return new Set()
  return new Set((rows ?? []).map((r) => String(r.profile_id)))
}

/**
 * When excludeGraduates, drop kisotsu ids from the candidate list.
 * Preserves order. Super-admin / Cron: pass excludeGraduates=false.
 */
export async function filterStudentIdsForAdminDryRun(
  admin: AdminClient,
  studentIds: string[],
  excludeGraduates: boolean,
): Promise<string[]> {
  const unique = [...new Set(studentIds.filter(Boolean))]
  if (!excludeGraduates || unique.length === 0) return unique
  const kisotsu = await fetchKisotsuStudentIdsViaAdmin(admin)
  return unique.filter((id) => !kisotsu.has(id))
}

export function dryRunGateKey(adminUserId: string, audienceScope: AdminDryRunAudienceScope): string {
  // Scope in key so enrolled results never share in-flight/cooldown with all-students runs.
  return `${adminUserId}:${audienceScope}`
}

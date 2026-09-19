import type { AnnouncementWithTargets } from '@/types/announcement'
import type { StudentSummary } from '@/lib/announcements/audience'
import { KISOTSU_GRADE_TAG } from '@/lib/tags/grade-order'

export type AnnouncementAudienceScope = 'all' | 'enrolled' | 'targeted'

export function normalizeAudienceScope(
  scope: string | null | undefined,
  targetAll: boolean,
): AnnouncementAudienceScope {
  if (scope === 'all' || scope === 'enrolled' || scope === 'targeted') return scope
  return targetAll ? 'all' : 'targeted'
}

/** Regular admins may only create/manage enrolled or non-kisotsu targeted. */
export function regularAdminMayManageAudienceScope(
  scope: AnnouncementAudienceScope,
): boolean {
  return scope === 'enrolled' || scope === 'targeted'
}

export function announcementAudienceForDelivery(
  announcement: Pick<AnnouncementWithTargets, 'audience_scope' | 'target_all'> &
    Partial<AnnouncementWithTargets>,
  allStudents: StudentSummary[],
  profileTagMap: Map<string, Set<string>>,
  kisotsuStudentIds: Set<string>,
  resolveTargeted: (
    a: AnnouncementWithTargets,
    students: StudentSummary[],
    tagMap: Map<string, Set<string>>,
  ) => StudentSummary[],
): StudentSummary[] {
  const scope = normalizeAudienceScope(
    announcement.audience_scope,
    announcement.target_all,
  )

  if (scope === 'all') return allStudents
  if (scope === 'enrolled') {
    return allStudents.filter((s) => !kisotsuStudentIds.has(s.id))
  }

  const full: AnnouncementWithTargets = {
    id: announcement.id ?? '',
    title: announcement.title ?? '',
    body: announcement.body ?? '',
    created_by: announcement.created_by ?? null,
    target_all: false,
    audience_scope: 'targeted',
    created_at: announcement.created_at ?? '',
    updated_at: announcement.updated_at ?? '',
    target_tag_ids: announcement.target_tag_ids ?? [],
    target_student_ids: announcement.target_student_ids ?? [],
  }
  return resolveTargeted(full, allStudents, profileTagMap)
}

export function targetingIncludesKisotsu(params: {
  tagIds: string[]
  studentIds: string[]
  tags: Array<{ id: string; category: string; name: string }>
  kisotsuStudentIds: Set<string>
}): boolean {
  for (const tagId of params.tagIds) {
    const tag = params.tags.find((t) => t.id === tagId)
    if (tag?.category === '学年' && tag.name === KISOTSU_GRADE_TAG) return true
  }
  for (const studentId of params.studentIds) {
    if (params.kisotsuStudentIds.has(studentId)) return true
  }
  return false
}

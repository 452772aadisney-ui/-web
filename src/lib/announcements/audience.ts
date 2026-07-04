import { getPersonName } from '@/lib/auth/display-name'
import type { AnnouncementWithTargets } from '@/types/announcement'
import type { StudentTag } from '@/types/tag'

export interface StudentSummary {
  id: string
  full_name: string
  display_name: string
}

export function resolveAnnouncementAudience(
  announcement: AnnouncementWithTargets,
  allStudents: StudentSummary[],
  profileTagMap: Map<string, Set<string>>,
): StudentSummary[] {
  if (announcement.target_all) {
    return allStudents
  }

  const audienceIds = new Set<string>()

  for (const studentId of announcement.target_student_ids) {
    audienceIds.add(studentId)
  }

  if (announcement.target_tag_ids.length > 0) {
    const targetTagSet = new Set(announcement.target_tag_ids)
    for (const student of allStudents) {
      const studentTags = profileTagMap.get(student.id)
      if (!studentTags) continue
      for (const tagId of studentTags) {
        if (targetTagSet.has(tagId)) {
          audienceIds.add(student.id)
          break
        }
      }
    }
  }

  return allStudents.filter((s) => audienceIds.has(s.id))
}

export function formatAnnouncementTargetSummary(
  announcement: AnnouncementWithTargets,
  tags: StudentTag[],
  students: StudentSummary[],
): string {
  if (announcement.target_all) return '全員'

  const parts: string[] = []

  if (announcement.target_tag_ids.length > 0) {
    const tagLabels = announcement.target_tag_ids
      .map((id) => tags.find((t) => t.id === id))
      .filter(Boolean)
      .map((t) => `${t!.category ? `${t!.category}:` : ''}${t!.name}`)
    if (tagLabels.length > 0) parts.push(`タグ: ${tagLabels.join('、')}`)
  }

  if (announcement.target_student_ids.length > 0) {
    const names = announcement.target_student_ids
      .map((id) => students.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => getPersonName(s!))
    if (names.length > 0) parts.push(`個別: ${names.join('、')}`)
  }

  return parts.length > 0 ? parts.join(' / ') : '配信先未設定'
}

export function buildProfileTagMap(
  assignments: Array<{ profile_id: string; tag_id: string }>,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const { profile_id, tag_id } of assignments) {
    const set = map.get(profile_id) ?? new Set()
    set.add(tag_id)
    map.set(profile_id, set)
  }
  return map
}

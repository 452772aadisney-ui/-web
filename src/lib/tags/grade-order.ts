import { getPersonName } from '@/lib/auth/display-name'
import { fullNameKanaSortKey } from '@/lib/profiles/full-name-kana'

export const GRADE_TAG_NAMES = ['高1', '高2', '高3', '既卒'] as const

export type GradeTagName = (typeof GRADE_TAG_NAMES)[number]

export const KISOTSU_GRADE_TAG: GradeTagName = '既卒'
export const KOSAN3_GRADE_TAG: GradeTagName = '高3'

export function isKisotsuGradeTag(gradeTagName: string | null | undefined): boolean {
  return gradeTagName === KISOTSU_GRADE_TAG
}

export function isKosan3GradeTag(gradeTagName: string | null | undefined): boolean {
  return gradeTagName === KOSAN3_GRADE_TAG
}

export function showsCommonTestCountdown(gradeTagName: string | null | undefined): boolean {
  return isKosan3GradeTag(gradeTagName) || isKisotsuGradeTag(gradeTagName)
}

/** Trailing bucket for missing / unexpected grade tags. */
export const UNASSIGNED_GRADE_LABEL = '学年未設定・その他'

export function isGradeTagName(value: string): value is GradeTagName {
  return (GRADE_TAG_NAMES as readonly string[]).includes(value)
}

/**
 * Sort index for grade tags: 高1 → 高2 → 高3 → 既卒 → 学年未設定・その他.
 * Missing / unexpected tags share the trailing bucket (do not drop students).
 */
export function getGradeSortIndex(name: string | null | undefined): number {
  if (!name || !isGradeTagName(name)) return GRADE_TAG_NAMES.length
  return GRADE_TAG_NAMES.indexOf(name)
}

/** Map raw tag to a display/sort bucket (unknown → 学年未設定・その他). */
export function resolveStudentGradeLabel(
  gradeTagName: string | null | undefined,
): string {
  if (!gradeTagName) return UNASSIGNED_GRADE_LABEL
  if (isGradeTagName(gradeTagName)) return gradeTagName
  return UNASSIGNED_GRADE_LABEL
}

export type StudentListItem = {
  id: string
  full_name: string
  display_name: string
  email: string
  student_code: string | null
  full_name_kana?: string | null
  last_accessed_at?: string | null
}

export type StudentListGroup = {
  gradeLabel: string
  students: StudentListItem[]
}

export type StudentSortable = {
  id: string
  full_name: string
  display_name?: string | null
  full_name_kana?: string | null
}

/**
 * Formal student order:
 * grade → kana (set first, unset last) → display name → id
 */
export function compareStudentsByGradeThenKana(
  a: StudentSortable,
  b: StudentSortable,
  gradeTagByStudentId: Map<string, string>,
): number {
  const gradeA = resolveStudentGradeLabel(gradeTagByStudentId.get(a.id))
  const gradeB = resolveStudentGradeLabel(gradeTagByStudentId.get(b.id))
  const byGrade = getGradeSortIndex(gradeA) - getGradeSortIndex(gradeB)
  if (byGrade !== 0) return byGrade

  const kanaA = fullNameKanaSortKey(a.full_name_kana)
  const kanaB = fullNameKanaSortKey(b.full_name_kana)
  if (kanaA && kanaB) {
    const byKana = kanaA.localeCompare(kanaB, 'ja')
    if (byKana !== 0) return byKana
  } else if (kanaA && !kanaB) {
    return -1
  } else if (!kanaA && kanaB) {
    return 1
  }

  const byDisplay = getPersonName(a).localeCompare(getPersonName(b), 'ja')
  if (byDisplay !== 0) return byDisplay

  const byFull = a.full_name.localeCompare(b.full_name, 'ja')
  if (byFull !== 0) return byFull

  return a.id.localeCompare(b.id)
}

export function sortStudentsByGradeThenKana<T extends StudentSortable>(
  students: T[],
  gradeTagByStudentId: Map<string, string>,
): T[] {
  return [...students].sort((a, b) =>
    compareStudentsByGradeThenKana(a, b, gradeTagByStudentId),
  )
}

/** @deprecated Prefer sortStudentsByGradeThenKana (kana-aware). */
export function sortStudentsByGradeThenName<T extends StudentSortable>(
  students: T[],
  gradeTagByStudentId: Map<string, string>,
): T[] {
  return sortStudentsByGradeThenKana(students, gradeTagByStudentId)
}

export function groupStudentsByGrade(
  students: StudentListItem[],
  gradeTagByStudentId: Map<string, string>,
): StudentListGroup[] {
  const buckets = new Map<string, StudentListItem[]>()

  for (const student of students) {
    const grade = resolveStudentGradeLabel(gradeTagByStudentId.get(student.id))
    const list = buckets.get(grade) ?? []
    list.push(student)
    buckets.set(grade, list)
  }

  const gradeOrder = [...GRADE_TAG_NAMES, UNASSIGNED_GRADE_LABEL]

  return gradeOrder
    .filter((label) => buckets.has(label))
    .map((gradeLabel) => ({
      gradeLabel,
      students: sortStudentsByGradeThenKana(buckets.get(gradeLabel) ?? [], gradeTagByStudentId),
    }))
}

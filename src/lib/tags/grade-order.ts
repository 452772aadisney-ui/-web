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

export const UNASSIGNED_GRADE_LABEL = '学年未設定'

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

/** Map raw tag to a display/sort bucket (unknown → 学年未設定). */
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
  last_accessed_at?: string | null
}

export type StudentListGroup = {
  gradeLabel: string
  students: StudentListItem[]
}

export function sortStudentsByGradeThenName<T extends { id: string; full_name: string }>(
  students: T[],
  gradeTagByStudentId: Map<string, string>,
): T[] {
  return [...students].sort((a, b) => {
    const gradeA = resolveStudentGradeLabel(gradeTagByStudentId.get(a.id))
    const gradeB = resolveStudentGradeLabel(gradeTagByStudentId.get(b.id))
    const byGrade = getGradeSortIndex(gradeA) - getGradeSortIndex(gradeB)
    if (byGrade !== 0) return byGrade
    return a.full_name.localeCompare(b.full_name, 'ja')
  })
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
      students: (buckets.get(gradeLabel) ?? []).sort((a, b) =>
        a.full_name.localeCompare(b.full_name, 'ja'),
      ),
    }))
}

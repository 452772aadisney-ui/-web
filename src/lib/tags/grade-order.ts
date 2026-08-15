export const GRADE_TAG_NAMES = ['高1', '高2', '高3', '浪人'] as const

export type GradeTagName = (typeof GRADE_TAG_NAMES)[number]

export const UNASSIGNED_GRADE_LABEL = '学年未設定'

export function isGradeTagName(value: string): value is GradeTagName {
  return (GRADE_TAG_NAMES as readonly string[]).includes(value)
}

export function getGradeSortIndex(name: string): number {
  const index = GRADE_TAG_NAMES.indexOf(name as GradeTagName)
  return index === -1 ? GRADE_TAG_NAMES.length : index
}

export type StudentListItem = {
  id: string
  full_name: string
  display_name: string
  email: string
  student_code: string | null
  last_sign_in_at?: string | null
}

export type StudentListGroup = {
  gradeLabel: string
  students: StudentListItem[]
}

export function groupStudentsByGrade(
  students: StudentListItem[],
  gradeTagByStudentId: Map<string, string>,
): StudentListGroup[] {
  const buckets = new Map<string, StudentListItem[]>()

  for (const student of students) {
    const grade = gradeTagByStudentId.get(student.id) ?? UNASSIGNED_GRADE_LABEL
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

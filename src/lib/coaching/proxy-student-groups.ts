import { getPersonName } from '@/lib/auth/display-name'
import { fullNameKanaSortKey } from '@/lib/profiles/full-name-kana'
import {
  GRADE_TAG_NAMES,
  isKisotsuGradeTag,
  sortStudentsByGradeThenKana,
  type StudentListGroup,
  type StudentListItem,
} from '@/lib/tags/grade-order'

/** Trailing bucket label for coaching proxy picker (既卒は候補外). */
export const COACHING_PROXY_OTHER_GRADE_LABEL = '学年未設定・その他'

const PROXY_GRADE_ORDER = ['高1', '高2', '高3', COACHING_PROXY_OTHER_GRADE_LABEL] as const

function resolveCoachingProxyGradeLabel(
  gradeTagName: string | null | undefined,
): (typeof PROXY_GRADE_ORDER)[number] {
  if (gradeTagName === '高1' || gradeTagName === '高2' || gradeTagName === '高3') {
    return gradeTagName
  }
  return COACHING_PROXY_OTHER_GRADE_LABEL
}

/**
 * Group students for coaching proxy booking:
 * 高1 → 高2 → 高3 → 学年未設定・その他 (既卒 excluded; unexpected tags in trailing bucket).
 * Within grade: full_name_kana 五十音 (unset last).
 */
export function groupStudentsForCoachingProxy(
  students: StudentListItem[],
  gradeTagByStudentId: Map<string, string>,
): StudentListGroup[] {
  const eligible = students.filter(
    (student) => !isKisotsuGradeTag(gradeTagByStudentId.get(student.id)),
  )

  const buckets = new Map<string, StudentListItem[]>()
  for (const student of eligible) {
    const grade = resolveCoachingProxyGradeLabel(gradeTagByStudentId.get(student.id))
    const list = buckets.get(grade) ?? []
    list.push(student)
    buckets.set(grade, list)
  }

  // Temporary map so shared sorter uses proxy bucket labels as grades.
  const proxyGradeMap = new Map<string, string>()
  for (const student of eligible) {
    proxyGradeMap.set(student.id, resolveCoachingProxyGradeLabel(gradeTagByStudentId.get(student.id)))
  }

  return PROXY_GRADE_ORDER.filter((label) => buckets.has(label)).map((gradeLabel) => ({
    gradeLabel,
    students: sortStudentsByGradeThenKana(buckets.get(gradeLabel) ?? [], proxyGradeMap),
  }))
}

export function filterCoachingProxyStudentGroups(
  groups: StudentListGroup[],
  query: string,
): StudentListGroup[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return groups

  const kanaQuery = fullNameKanaSortKey(query)?.toLowerCase() ?? normalized

  return groups
    .map((group) => ({
      ...group,
      students: group.students.filter((student) => {
        const name = getPersonName(student).toLowerCase()
        const code = (student.student_code ?? '').toLowerCase()
        const kana = (fullNameKanaSortKey(student.full_name_kana) ?? '').toLowerCase()
        return (
          name.includes(normalized) ||
          code.includes(normalized) ||
          (kana.length > 0 && kana.includes(kanaQuery))
        )
      }),
    }))
    .filter((group) => group.students.length > 0)
}

/** Exported for tests — known high-school grades used by proxy grouping. */
export const COACHING_PROXY_KNOWN_GRADES = GRADE_TAG_NAMES.filter((g) => g !== '既卒')

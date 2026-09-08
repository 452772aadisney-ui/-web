import { describe, expect, it } from 'vitest'
import {
  COACHING_PROXY_OTHER_GRADE_LABEL,
  compareStudentDisplayNamesJa,
  filterCoachingProxyStudentGroups,
  groupStudentsForCoachingProxy,
} from '@/lib/coaching/proxy-student-groups'
import type { StudentListItem } from '@/lib/tags/grade-order'

function student(id: string, full_name: string, code: string | null = null): StudentListItem {
  return {
    id,
    full_name,
    display_name: full_name,
    email: `${id}@example.com`,
    student_code: code,
  }
}

describe('groupStudentsForCoachingProxy', () => {
  it('orders grades 高1→高2→高3→学年未設定・その他 and excludes 既卒', () => {
    const grades = new Map([
      ['a', '高2'],
      ['b', '高1'],
      ['c', '既卒'],
      ['d', '高3'],
      ['e', '中2'],
    ])
    const groups = groupStudentsForCoachingProxy(
      [
        student('a', '山田'),
        student('b', '佐藤'),
        student('c', '鈴木'),
        student('d', '高橋'),
        student('e', '渡辺'),
      ],
      grades,
    )

    expect(groups.map((g) => g.gradeLabel)).toEqual([
      '高1',
      '高2',
      '高3',
      COACHING_PROXY_OTHER_GRADE_LABEL,
    ])
    expect(groups.flatMap((g) => g.students.map((s) => s.id))).not.toContain('c')
    expect(groups.at(-1)?.students.map((s) => s.id)).toEqual(['e'])
  })

  it('sorts within a grade by Japanese display name', () => {
    const grades = new Map([
      ['a', '高1'],
      ['b', '高1'],
      ['c', '高1'],
    ])
    const groups = groupStudentsForCoachingProxy(
      [student('a', '山田'), student('b', '伊藤'), student('c', '佐藤')],
      grades,
    )
    expect(groups[0]?.students.map((s) => s.full_name)).toEqual(['伊藤', '佐藤', '山田'])
    expect(compareStudentDisplayNamesJa(student('b', '伊藤'), student('c', '佐藤'))).toBeLessThan(
      0,
    )
  })

  it('keeps grade headings and order after search', () => {
    const grades = new Map([
      ['a', '高1'],
      ['b', '高2'],
      ['c', '高1'],
    ])
    const groups = groupStudentsForCoachingProxy(
      [student('a', '山田太郎'), student('b', '山田花子'), student('c', '佐藤')],
      grades,
    )
    const filtered = filterCoachingProxyStudentGroups(groups, '山田')
    expect(filtered.map((g) => g.gradeLabel)).toEqual(['高1', '高2'])
    expect(filtered[0]?.students.map((s) => s.id)).toEqual(['a'])
  })
})

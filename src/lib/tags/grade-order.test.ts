import { describe, expect, it } from 'vitest'
import {
  getGradeSortIndex,
  groupStudentsByGrade,
  resolveStudentGradeLabel,
  sortStudentsByGradeThenName,
  UNASSIGNED_GRADE_LABEL,
} from '@/lib/tags/grade-order'

function student(id: string, full_name: string) {
  return {
    id,
    full_name,
    display_name: full_name,
    email: `${id}@example.com`,
    student_code: null,
  }
}

describe('grade order for student lists', () => {
  it('orders 高1 → 高2 → 高3 → 既卒 → 学年未設定・その他', () => {
    expect(getGradeSortIndex('高1')).toBe(0)
    expect(getGradeSortIndex('高2')).toBe(1)
    expect(getGradeSortIndex('高3')).toBe(2)
    expect(getGradeSortIndex('既卒')).toBe(3)
    expect(getGradeSortIndex(UNASSIGNED_GRADE_LABEL)).toBe(4)
    expect(getGradeSortIndex(null)).toBe(4)
    expect(getGradeSortIndex('中1')).toBe(4)
  })

  it('sorts by grade then Japanese name within the same grade', () => {
    const grades = new Map([
      ['a', '高2'],
      ['b', '高1'],
      ['c', '高1'],
      ['d', '既卒'],
      ['e', '高3'],
      ['f', '中2'],
    ])
    const sorted = sortStudentsByGradeThenName(
      [
        student('a', '山田'),
        student('b', '佐藤'),
        student('c', '伊藤'),
        student('d', '鈴木'),
        student('e', '高橋'),
        student('f', '渡辺'),
      ],
      grades,
    )
    expect(sorted.map((s) => s.id)).toEqual(['c', 'b', 'a', 'e', 'd', 'f'])
  })

  it('keeps unexpected grades in the trailing group instead of dropping them', () => {
    const groups = groupStudentsByGrade(
      [student('a', '青木'), student('b', '木村'), student('c', '中村')],
      new Map([
        ['a', '高1'],
        ['b', '中3'],
      ]),
    )

    expect(groups.map((g) => g.gradeLabel)).toEqual(['高1', UNASSIGNED_GRADE_LABEL])
    expect(groups[1]?.students.map((s) => s.id).sort()).toEqual(['b', 'c'])
    expect(resolveStudentGradeLabel('中3')).toBe(UNASSIGNED_GRADE_LABEL)
  })
})

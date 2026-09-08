import { describe, expect, it } from 'vitest'
import {
  getGradeSortIndex,
  groupStudentsByGrade,
  resolveStudentGradeLabel,
  sortStudentsByGradeThenKana,
  UNASSIGNED_GRADE_LABEL,
} from '@/lib/tags/grade-order'

function student(
  id: string,
  full_name: string,
  kana: string | null = null,
) {
  return {
    id,
    full_name,
    display_name: full_name,
    email: `${id}@example.com`,
    student_code: null as string | null,
    full_name_kana: kana,
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

  it('sorts by grade then kana within the same grade', () => {
    const grades = new Map([
      ['a', '高2'],
      ['b', '高1'],
      ['c', '高1'],
      ['d', '既卒'],
      ['e', '高3'],
      ['f', '中2'],
    ])
    const sorted = sortStudentsByGradeThenKana(
      [
        student('a', '山田', 'やまだ'),
        student('b', '佐藤', 'さとう'),
        student('c', '伊藤', 'いとう'),
        student('d', '鈴木', 'すずき'),
        student('e', '高橋', 'たかはし'),
        student('f', '渡辺', 'わたなべ'),
      ],
      grades,
    )
    expect(sorted.map((s) => s.id)).toEqual(['c', 'b', 'a', 'e', 'd', 'f'])
  })

  it('puts unset kana at the end of the grade, then display name / id', () => {
    const grades = new Map([
      ['a', '高1'],
      ['b', '高1'],
      ['c', '高1'],
      ['d', '高1'],
    ])
    const sorted = sortStudentsByGradeThenKana(
      [
        student('a', '山田', 'やまだ'),
        student('b', '青木', null),
        student('c', '伊藤', 'いとう'),
        student('d', '阿部', null),
      ],
      grades,
    )
    expect(sorted.map((s) => s.id)).toEqual(['c', 'a', 'd', 'b'])
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

  it('includes 既卒 in admin list grouping (unlike proxy)', () => {
    const groups = groupStudentsByGrade(
      [student('a', '山田', 'やまだ'), student('b', '鈴木', 'すずき')],
      new Map([
        ['a', '高1'],
        ['b', '既卒'],
      ]),
    )
    expect(groups.map((g) => g.gradeLabel)).toEqual(['高1', '既卒'])
  })

  it('keeps pagination order stable across pages when sliced after full sort', () => {
    const grades = new Map(
      Array.from({ length: 5 }, (_, i) => [`s${i}`, '高1'] as const),
    )
    const students = [
      student('s0', '山田', 'やまだ'),
      student('s1', '伊藤', 'いとう'),
      student('s2', '佐藤', null),
      student('s3', '青木', 'あおき'),
      student('s4', '加藤', 'かとう'),
    ]
    const ordered = sortStudentsByGradeThenKana(students, grades).map((s) => s.id)
    expect(ordered).toEqual(['s3', 's1', 's4', 's0', 's2'])
    expect(ordered.slice(0, 2)).toEqual(['s3', 's1'])
    expect(ordered.slice(2, 4)).toEqual(['s4', 's0'])
  })
})

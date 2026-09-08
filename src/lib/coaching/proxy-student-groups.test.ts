import { describe, expect, it } from 'vitest'
import {
  COACHING_PROXY_OTHER_GRADE_LABEL,
  filterCoachingProxyStudentGroups,
  groupStudentsForCoachingProxy,
} from '@/lib/coaching/proxy-student-groups'
import type { StudentListItem } from '@/lib/tags/grade-order'

function student(
  id: string,
  full_name: string,
  opts: { code?: string | null; kana?: string | null } = {},
): StudentListItem {
  return {
    id,
    full_name,
    display_name: full_name,
    email: `${id}@example.com`,
    student_code: opts.code ?? null,
    full_name_kana: opts.kana ?? null,
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

  it('sorts within a grade by kana, unset last', () => {
    const grades = new Map([
      ['a', '高1'],
      ['b', '高1'],
      ['c', '高1'],
      ['d', '高1'],
    ])
    const groups = groupStudentsForCoachingProxy(
      [
        student('a', '山田', { kana: 'やまだ' }),
        student('b', '伊藤', { kana: 'いとう' }),
        student('c', '佐藤', { kana: null }),
        student('d', '青木', { kana: 'あおき' }),
      ],
      grades,
    )
    expect(groups[0]?.students.map((s) => s.id)).toEqual(['d', 'b', 'a', 'c'])
  })

  it('keeps grade headings and order after search including kana', () => {
    const grades = new Map([
      ['a', '高1'],
      ['b', '高2'],
      ['c', '高1'],
    ])
    const groups = groupStudentsForCoachingProxy(
      [
        student('a', '山田太郎', { kana: 'やまだたろう' }),
        student('b', '山田花子', { kana: 'やまだはなこ' }),
        student('c', '佐藤', { kana: 'さとう' }),
      ],
      grades,
    )
    const byName = filterCoachingProxyStudentGroups(groups, '山田')
    expect(byName.map((g) => g.gradeLabel)).toEqual(['高1', '高2'])
    expect(byName[0]?.students.map((s) => s.id)).toEqual(['a'])

    const byKana = filterCoachingProxyStudentGroups(groups, 'やまだ')
    expect(byKana.flatMap((g) => g.students.map((s) => s.id)).sort()).toEqual(['a', 'b'])
  })

  it('keeps students without kana in search by name', () => {
    const grades = new Map([['a', '高1']])
    const groups = groupStudentsForCoachingProxy(
      [student('a', '田中', { kana: null })],
      grades,
    )
    expect(filterCoachingProxyStudentGroups(groups, '田中')[0]?.students).toHaveLength(1)
  })
})

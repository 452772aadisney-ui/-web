import { describe, expect, it } from 'vitest'
import {
  buildPendingStudyDayPairs,
  defaultPendingListDateLabel,
  isStudyDayFeedbackIncomplete,
  matchesPendingStudentName,
  paginatePendingPairs,
  pendingStudyDayKey,
  resolvePendingDateFilter,
  sortPendingStudyDayPairs,
} from '@/lib/study/pending-feedback'

describe('isStudyDayFeedbackIncomplete', () => {
  it('treats missing feedback as incomplete (badge-compatible)', () => {
    expect(isStudyDayFeedbackIncomplete(null)).toBe(true)
    expect(isStudyDayFeedbackIncomplete(undefined)).toBe(true)
    expect(
      isStudyDayFeedbackIncomplete({
        id: '1',
        student_id: 's',
        studied_on: '2026-09-21',
        stamp: 'good',
        comment: '',
        admin_id: 'a',
        created_at: '',
        updated_at: '',
      }),
    ).toBe(false)
  })

  it('stays incomplete when only a comment would exist conceptually (stamp row required)', () => {
    // Day-level model has no comment-only row; incomplete <=> no feedback row.
    expect(isStudyDayFeedbackIncomplete(null)).toBe(true)
  })
})

describe('resolvePendingDateFilter', () => {
  it('defaults to yesterday-and-earlier (excludes today)', () => {
    expect(resolvePendingDateFilter({ todayKey: '2026-09-23' })).toEqual({
      mode: 'beforeToday',
      beforeExclusive: '2026-09-23',
    })
    expect(defaultPendingListDateLabel('2026-09-23')).toBe('2026-09-22 以前')
  })

  it('allows an exact date including today when specified', () => {
    expect(
      resolvePendingDateFilter({ todayKey: '2026-09-23', date: '2026-09-23' }),
    ).toEqual({ mode: 'exact', date: '2026-09-23' })
  })

  it('ignores invalid date strings', () => {
    expect(
      resolvePendingDateFilter({ todayKey: '2026-09-23', date: 'yesterday' }),
    ).toEqual({ mode: 'beforeToday', beforeExclusive: '2026-09-23' })
  })
})

describe('buildPendingStudyDayPairs', () => {
  it('dedupes logs and keeps days without feedback', () => {
    const pairs = buildPendingStudyDayPairs(
      [
        { studentId: 'a', studiedOn: '2026-09-21' },
        { studentId: 'a', studiedOn: '2026-09-21' },
        { studentId: 'b', studiedOn: '2026-09-21' },
        { studentId: 'c', studiedOn: '2026-09-20' },
      ],
      new Set([pendingStudyDayKey('b', '2026-09-21')]),
    )
    expect(pairs).toEqual([
      { studentId: 'a', studiedOn: '2026-09-21' },
      { studentId: 'c', studiedOn: '2026-09-20' },
    ])
  })

  it('reappears after feedback key is removed (reaction cleared)', () => {
    const logs = [{ studentId: 'a', studiedOn: '2026-09-21' }]
    expect(buildPendingStudyDayPairs(logs, new Set(['a:2026-09-21']))).toEqual([])
    expect(buildPendingStudyDayPairs(logs, new Set())).toEqual([
      { studentId: 'a', studiedOn: '2026-09-21' },
    ])
  })
})

describe('sortPendingStudyDayPairs', () => {
  it('orders by date desc then ja name', () => {
    const sorted = sortPendingStudyDayPairs(
      [
        { studentId: '1', studiedOn: '2026-09-20' },
        { studentId: '2', studiedOn: '2026-09-21' },
        { studentId: '3', studiedOn: '2026-09-21' },
      ],
      new Map([
        ['1', '山田'],
        ['2', '佐藤'],
        ['3', '鈴木'],
      ]),
    )
    expect(sorted.map((p) => `${p.studiedOn}:${p.studentId}`)).toEqual([
      '2026-09-21:2',
      '2026-09-21:3',
      '2026-09-20:1',
    ])
  })
})

describe('paginatePendingPairs', () => {
  it('pages by pair without splitting a day across pages incorrectly', () => {
    const pairs = Array.from({ length: 5 }, (_, i) => ({
      studentId: `s${i}`,
      studiedOn: '2026-09-21',
    }))
    const page1 = paginatePendingPairs(pairs, 1, 2)
    const page2 = paginatePendingPairs(pairs, 2, 2)
    const page3 = paginatePendingPairs(pairs, 3, 2)

    expect(page1.totalCount).toBe(5)
    expect(page1.pageItems).toHaveLength(2)
    expect(page2.pageItems).toHaveLength(2)
    expect(page3.pageItems).toHaveLength(1)
    expect(page3.page).toBe(3)
  })

  it('clamps oversized page numbers', () => {
    const result = paginatePendingPairs([1, 2, 3], 99, 2)
    expect(result.page).toBe(2)
    expect(result.pageItems).toEqual([3])
  })
})

describe('matchesPendingStudentName', () => {
  it('matches case-insensitively and ignores empty query', () => {
    expect(matchesPendingStudentName('山田太郎', '')).toBe(true)
    expect(matchesPendingStudentName('山田太郎', '山田')).toBe(true)
    expect(matchesPendingStudentName('山田太郎', '鈴木')).toBe(false)
  })
})

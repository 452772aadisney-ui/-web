import { describe, expect, it } from 'vitest'
import {
  buildClassCourseDisplayName,
  buildClassCourseGroupHeading,
  buildClassCourseSelectLabel,
  compareClassCourseUnitOrder,
  CLASS_COURSE_FEE_KIND_LABELS,
  formatClassCourseSeq,
  resolveClassCourseFeeKind,
  resolveAcademicYearFromJstDateKey,
} from '@/lib/class-course/catalog'
import {
  buildClassCourseRegistrationPopup,
  planClassCourseSeqRange,
} from '@/lib/class-course/numbering'

describe('formatClassCourseSeq', () => {
  it('uses circled digits through 50 and parentheses after', () => {
    expect(formatClassCourseSeq(1)).toBe('①')
    expect(formatClassCourseSeq(10)).toBe('⑩')
    expect(formatClassCourseSeq(20)).toBe('⑳')
    expect(formatClassCourseSeq(21)).toBe('㉑')
    expect(formatClassCourseSeq(50)).toBe('㊿')
    expect(formatClassCourseSeq(51)).toBe('（51）')
    expect(formatClassCourseSeq(99)).toBe('（99）')
  })
})

describe('buildClassCourseDisplayName', () => {
  it('formats regular and addon labels', () => {
    expect(
      buildClassCourseDisplayName({
        subject: 'english_reading',
        term: 'second_half',
        track: 'regular',
        seqNo: 10,
      }),
    ).toBe('英文読解・後期⑩')
    expect(
      buildClassCourseDisplayName({
        subject: 'english_grammar',
        term: 'second_half',
        track: 'addon',
        seqNo: 1,
      }),
    ).toBe('英文法・後期・追加①')
  })
})

describe('resolveClassCourseFeeKind', () => {
  it('derives fee kind from term and track', () => {
    expect(resolveClassCourseFeeKind('first_half', 'regular')).toBe('monthly_regular')
    expect(resolveClassCourseFeeKind('summer', 'regular')).toBe('course')
    expect(resolveClassCourseFeeKind('summer', 'addon')).toBe('addon')
  })

  it('labels monthly_regular as レギュラー without 月謝', () => {
    expect(CLASS_COURSE_FEE_KIND_LABELS.monthly_regular).toBe('レギュラー')
  })
})

describe('compareClassCourseUnitOrder', () => {
  it('orders by seq_no numerically within the same scope', () => {
    const rows = [
      { academicYear: 2026, term: 'second_half', subject: 'english_reading', track: 'regular', seqNo: 10 },
      { academicYear: 2026, term: 'second_half', subject: 'english_reading', track: 'regular', seqNo: 2 },
      { academicYear: 2026, term: 'second_half', subject: 'english_reading', track: 'regular', seqNo: 51 },
      { academicYear: 2026, term: 'second_half', subject: 'english_reading', track: 'regular', seqNo: 1 },
    ] as const
    const sorted = [...rows].sort(compareClassCourseUnitOrder)
    expect(sorted.map((r) => r.seqNo)).toEqual([1, 2, 10, 51])
  })

  it('keeps different tracks and years from mixing by display name', () => {
    const rows = [
      { academicYear: 2026, term: 'second_half', subject: 'english_reading', track: 'addon', seqNo: 1 },
      { academicYear: 2025, term: 'second_half', subject: 'english_reading', track: 'regular', seqNo: 1 },
      { academicYear: 2026, term: 'second_half', subject: 'english_reading', track: 'regular', seqNo: 1 },
    ] as const
    const sorted = [...rows].sort(compareClassCourseUnitOrder)
    expect(sorted.map((r) => `${r.academicYear}:${r.track}:${r.seqNo}`)).toEqual([
      '2025:regular:1',
      '2026:regular:1',
      '2026:addon:1',
    ])
  })
})

describe('select / group labels', () => {
  it('builds distinguishable select labels', () => {
    expect(
      buildClassCourseSelectLabel({
        academicYear: 2026,
        subject: 'english_reading',
        term: 'second_half',
        track: 'regular',
        seqNo: 3,
      }),
    ).toContain('2026年度')
    expect(
      buildClassCourseSelectLabel({
        academicYear: 2026,
        subject: 'english_reading',
        term: 'second_half',
        track: 'addon',
        seqNo: 3,
      }),
    ).toContain('単発追加')
  })

  it('builds group headings', () => {
    expect(
      buildClassCourseGroupHeading({
        academicYear: 2026,
        subject: 'english_reading',
        term: 'second_half',
        track: 'regular',
      }),
    ).toBe('2026年度・英文読解・後期・通常枠')
  })
})

describe('academic year', () => {
  it('starts in March JST', () => {
    expect(resolveAcademicYearFromJstDateKey('2026-03-01')).toBe(2026)
    expect(resolveAcademicYearFromJstDateKey('2027-02-28')).toBe(2026)
    expect(resolveAcademicYearFromJstDateKey('2027-03-01')).toBe(2027)
  })
})

describe('planClassCourseSeqRange', () => {
  it('appends after max without filling gaps', () => {
    const plan = planClassCourseSeqRange({
      existingSeqNumbers: [1, 2, 5],
      mode: 'append',
      count: 2,
    })
    expect(plan).toMatchObject({
      ok: true,
      startSeq: 6,
      endSeq: 7,
      shift: 0,
    })
  })

  it('shifts custom start past conflicts (confirmed example)', () => {
    const existing = Array.from({ length: 11 }, (_, i) => i + 1)
    const plan = planClassCourseSeqRange({
      existingSeqNumbers: existing,
      mode: 'custom',
      startSeq: 10,
      count: 3,
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.seqNumbers).toEqual([12, 13, 14])
    expect(plan.overlapCount).toBe(2)
    expect(plan.shift).toBe(2)
    const popup = buildClassCourseRegistrationPopup({
      plan,
      term: 'second_half',
      track: 'regular',
      subject: 'english_reading',
    })
    expect(popup.body).toContain('重複分（2回）')
    expect(popup.body).toContain('後期⑫〜⑭（3回）')
  })

  it('uses alternate popup when overlap count differs from shift', () => {
    const plan = planClassCourseSeqRange({
      existingSeqNumbers: [1, 2, 5, 6],
      mode: 'custom',
      startSeq: 3,
      count: 3,
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.seqNumbers).toEqual([7, 8, 9])
    expect(plan.overlapCount).toBe(1)
    expect(plan.shift).toBe(4)
    const popup = buildClassCourseRegistrationPopup({
      plan,
      term: 'second_half',
      track: 'regular',
      subject: 'english_grammar',
    })
    expect(popup.body).toContain('開始番号を③から⑦へ')
    expect(popup.body).toContain('重複 1件')
  })

  it('uses gap when fully free without shift', () => {
    const plan = planClassCourseSeqRange({
      existingSeqNumbers: [1, 2],
      mode: 'custom',
      startSeq: 3,
      count: 2,
    })
    expect(plan).toMatchObject({ ok: true, startSeq: 3, endSeq: 4, shift: 0 })
  })

  it('errors when range would exceed 99', () => {
    const plan = planClassCourseSeqRange({
      existingSeqNumbers: [90, 91, 92, 93, 94, 95],
      mode: 'custom',
      startSeq: 90,
      count: 10,
    })
    expect(plan.ok).toBe(false)
  })
})

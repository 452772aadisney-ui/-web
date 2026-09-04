import { describe, expect, it } from 'vitest'
import { formatDuration } from '@/lib/study/chart-data'
import { formatTodayStudyButtonSubtitle } from '@/lib/study/today-status'
import { buildTextbookStudyUsage } from '@/lib/study/queries'
import {
  buildOnboardingChecklist,
  hasRegisteredTargetSchools,
  isValidBirthday,
  shouldShowOnboardingChecklist,
} from '@/lib/student/onboarding-checklist'

describe('formatTodayStudyButtonSubtitle', () => {
  it('shows empty messaging for zero minutes', () => {
    expect(formatTodayStudyButtonSubtitle(0)).toEqual({
      text: '今日はまだ学習記録がありません',
      tone: 'empty',
    })
  })

  it('formats recorded minutes with duration helper', () => {
    expect(formatTodayStudyButtonSubtitle(45)).toEqual({
      text: `今日の記録：${formatDuration(45)}`,
      tone: 'recorded',
    })
    expect(formatTodayStudyButtonSubtitle(60).text).toBe('今日の記録：1時間')
    expect(formatTodayStudyButtonSubtitle(150).text).toBe('今日の記録：2時間30分')
  })
})

describe('buildTextbookStudyUsage', () => {
  it('keeps newest unique textbooks up to the limit', () => {
    const usage = buildTextbookStudyUsage(
      [
        { textbook_id: 'a', studied_on: '2026-09-04' },
        { textbook_id: 'a', studied_on: '2026-09-03' },
        { textbook_id: 'b', studied_on: '2026-09-02' },
        { textbook_id: 'c', studied_on: '2026-09-01' },
        { textbook_id: 'd', studied_on: '2026-08-30' },
        { textbook_id: 'e', studied_on: '2026-08-29' },
        { textbook_id: null, studied_on: '2026-09-04' },
      ],
      4,
    )

    expect(usage.recentTextbookIds).toEqual(['a', 'b', 'c', 'd'])
    expect(usage.lastStudiedOnByTextbookId).toEqual({
      a: '2026-09-04',
      b: '2026-09-02',
      c: '2026-09-01',
      d: '2026-08-30',
      e: '2026-08-29',
    })
  })
})

describe('onboarding checklist', () => {
  it('treats 未定 as a completed target school', () => {
    expect(hasRegisteredTargetSchools(['未定'])).toBe(true)
    expect(hasRegisteredTargetSchools(['  '])).toBe(false)
    expect(isValidBirthday('2008-04-01')).toBe(true)
    expect(isValidBirthday('')).toBe(false)
  })

  it('shows checklist only while incomplete items remain', () => {
    const incomplete = {
      subjects: [],
      birthday: null,
      targetSchools: [],
      textbookCount: 0,
      hasPositiveStudyLog: false,
    }
    expect(shouldShowOnboardingChecklist(incomplete)).toBe(true)
    expect(buildOnboardingChecklist(incomplete).every((item) => !item.completed)).toBe(true)

    const complete = {
      subjects: ['数学'],
      birthday: '2008-04-01',
      targetSchools: ['未定'],
      textbookCount: 1,
      hasPositiveStudyLog: true,
    }
    expect(shouldShowOnboardingChecklist(complete)).toBe(false)
    expect(buildOnboardingChecklist(complete).every((item) => item.completed)).toBe(true)
  })
})

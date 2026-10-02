import { describe, expect, it } from 'vitest'
import { computeCurrentStudyStreak, formatStudyStreakLabel } from './streak'
import { readFileSync } from 'node:fs'

describe('dashboard study streak', () => {
  it('counts unique days and retains yesterday streak before today is recorded', () => {
    expect(computeCurrentStudyStreak(['2026-10-01', '2026-10-01', '2026-09-30'], '2026-10-02')).toBe(2)
    expect(computeCurrentStudyStreak(['2026-10-02', '2026-10-01'], '2026-10-02')).toBe(2)
  })

  it('resets after a missing day and hides the zero-day label', () => {
    expect(computeCurrentStudyStreak(['2026-09-30'], '2026-10-02')).toBe(0)
    expect(formatStudyStreakLabel(0)).toBeNull()
    expect(formatStudyStreakLabel(3)).toBe('連続3日記録中!')
  })

  it('wires streak fetch into the home study button subtitle', () => {
    const dashboard = readFileSync('src/app/dashboard/page.tsx', 'utf8')
    const actions = readFileSync('src/components/student/MyPageActions.tsx', 'utf8')
    const streak = readFileSync('src/lib/study/streak.ts', 'utf8')
    const queries = readFileSync('src/lib/study/queries.ts', 'utf8')

    expect(dashboard).toContain('fetchCurrentStudyStreakForStudent')
    expect(dashboard).toContain('studyStreakDays={studyStreakDays}')
    expect(actions).toContain('formatStudyStreakLabel(studyStreakDays)')
    expect(actions).toContain('subtitle={studyStreakLabel ?? undefined}')
    expect(streak).toContain('連続${streakDays}日記録中')

    const streakFetch = queries.match(
      /export async function fetchCurrentStudyStreakForStudent[\s\S]*?^}/m,
    )?.[0]
    expect(streakFetch).toBeTruthy()
    expect(streakFetch).toContain(".select('studied_on')")
    // App-level .limit() would drop older days; pagination via .range() avoids
    // PostgREST single-response truncation (~1000) while keeping all dates.
    expect(streakFetch).not.toContain('.limit(')
    expect(streakFetch).toContain('STUDY_STREAK_PAGE_SIZE')
    expect(streakFetch).toContain('.range(from, from + STUDY_STREAK_PAGE_SIZE - 1)')
    expect(streakFetch).toContain("order('studied_on', { ascending: false })")
    expect(streakFetch).toContain('if (data.length < STUDY_STREAK_PAGE_SIZE) break')
  })
})

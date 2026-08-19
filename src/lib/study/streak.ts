import { getJstDateKey, shiftDateKey } from '@/lib/study/dates'

/** 今日（または昨日まで）の連続学習記録日数 */
export function computeCurrentStudyStreak(
  studiedOnDates: string[],
  todayKey: string = getJstDateKey(),
): number {
  const uniqueDates = new Set(studiedOnDates)
  if (uniqueDates.size === 0) return 0

  let startKey = todayKey
  if (!uniqueDates.has(todayKey)) {
    const yesterdayKey = shiftDateKey(todayKey, -1)
    if (!uniqueDates.has(yesterdayKey)) return 0
    startKey = yesterdayKey
  }

  let streak = 0
  let cursor = startKey
  while (uniqueDates.has(cursor)) {
    streak += 1
    cursor = shiftDateKey(cursor, -1)
  }

  return streak
}

export function getStudyStreakExclamationCount(streakDays: number): number {
  if (streakDays <= 0) return 0
  if (streakDays <= 5) return 1
  if (streakDays <= 9) return 2
  if (streakDays <= 19) return 3
  if (streakDays <= 29) return 4
  if (streakDays < 90) return 5
  return 5 + Math.floor((streakDays - 30) / 60)
}

export function formatStudyStreakLabel(streakDays: number): string | null {
  if (streakDays <= 0) return null
  const exclamations = '!'.repeat(getStudyStreakExclamationCount(streakDays))
  return `連続${streakDays}日登録中${exclamations}`
}

import { resolveStudySubjectCategory } from '@/lib/constants/textbook-subject-categories'
import { shiftDateKey } from '@/lib/study/dates'

export type AchievementMetrics = {
  studyLogCount: number
  totalStudyMinutes: number
  maxStudyStreak: number
  maxDailyStudyMinutes: number
  maxSubjectsInOneDay: number
  textbookCount: number
  hasCoachingMonthWith4Plus: boolean
}

type StudyLogRow = {
  subject: string
  duration_minutes: number
  studied_on: string
}

type CoachingBookingRow = {
  status: string
  slot_date: string | null
}

export function computeMaxStudyStreak(studiedOnDates: string[]): number {
  const uniqueDates = [...new Set(studiedOnDates)].sort()
  if (uniqueDates.length === 0) return 0
  if (uniqueDates.length === 1) return 1

  let maxStreak = 1
  let currentStreak = 1

  for (let index = 1; index < uniqueDates.length; index += 1) {
    const previous = uniqueDates[index - 1]
    const current = uniqueDates[index]
    if (shiftDateKey(previous, 1) === current) {
      currentStreak += 1
      maxStreak = Math.max(maxStreak, currentStreak)
    } else {
      currentStreak = 1
    }
  }

  return maxStreak
}

export function buildAchievementMetrics(input: {
  studyLogs: StudyLogRow[]
  textbookCount: number
  coachingBookings: CoachingBookingRow[]
}): AchievementMetrics {
  const dailyMinutes = new Map<string, number>()
  const dailySubjects = new Map<string, Set<string>>()
  let totalStudyMinutes = 0

  for (const log of input.studyLogs) {
    totalStudyMinutes += log.duration_minutes
    dailyMinutes.set(log.studied_on, (dailyMinutes.get(log.studied_on) ?? 0) + log.duration_minutes)

    const category = resolveStudySubjectCategory(log.subject) ?? log.subject
    const subjectSet = dailySubjects.get(log.studied_on) ?? new Set<string>()
    subjectSet.add(category)
    dailySubjects.set(log.studied_on, subjectSet)
  }

  const maxDailyStudyMinutes = Math.max(0, ...Array.from(dailyMinutes.values()))
  const maxSubjectsInOneDay = Math.max(
    0,
    ...Array.from(dailySubjects.values()).map((subjects) => subjects.size),
  )

  const monthCounts = new Map<string, number>()
  for (const booking of input.coachingBookings) {
    if (booking.status === 'cancelled' || !booking.slot_date) continue
    const monthKey = booking.slot_date.slice(0, 7)
    monthCounts.set(monthKey, (monthCounts.get(monthKey) ?? 0) + 1)
  }

  return {
    studyLogCount: input.studyLogs.length,
    totalStudyMinutes,
    maxStudyStreak: computeMaxStudyStreak(input.studyLogs.map((log) => log.studied_on)),
    maxDailyStudyMinutes,
    maxSubjectsInOneDay,
    textbookCount: input.textbookCount,
    hasCoachingMonthWith4Plus: Array.from(monthCounts.values()).some((count) => count >= 4),
  }
}

export function getUnlockableAchievementIds(
  metrics: AchievementMetrics,
  existingIds: Set<string>,
): string[] {
  const unlockable: string[] = []
  const has = (id: string) => existingIds.has(id) || unlockable.includes(id)

  if (!has('first_study_log') && metrics.studyLogCount >= 1) unlockable.push('first_study_log')
  if (!has('textbooks_5') && metrics.textbookCount >= 5) unlockable.push('textbooks_5')
  if (!has('textbooks_10') && metrics.textbookCount >= 10) unlockable.push('textbooks_10')

  if (!has('streak_3') && metrics.maxStudyStreak >= 3) unlockable.push('streak_3')
  if (!has('streak_7') && metrics.maxStudyStreak >= 7) unlockable.push('streak_7')
  if (!has('streak_14') && metrics.maxStudyStreak >= 14) unlockable.push('streak_14')
  if (!has('streak_30') && metrics.maxStudyStreak >= 30) unlockable.push('streak_30')

  if (!has('total_10h') && metrics.totalStudyMinutes >= 600) unlockable.push('total_10h')
  if (!has('total_100h') && metrics.totalStudyMinutes >= 6000) unlockable.push('total_100h')
  if (!has('total_500h') && metrics.totalStudyMinutes >= 30000) unlockable.push('total_500h')
  if (!has('total_1000h') && metrics.totalStudyMinutes >= 60000) unlockable.push('total_1000h')

  if (!has('daily_5h') && metrics.maxDailyStudyMinutes >= 300) unlockable.push('daily_5h')
  if (!has('daily_10h') && metrics.maxDailyStudyMinutes >= 600) unlockable.push('daily_10h')

  if (!has('subjects_3_day') && metrics.maxSubjectsInOneDay >= 3) {
    unlockable.push('subjects_3_day')
  }

  if (!has('coaching_4_month') && metrics.hasCoachingMonthWith4Plus) {
    unlockable.push('coaching_4_month')
  }

  return unlockable
}

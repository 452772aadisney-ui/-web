import { resolveStudySubjectCategory } from '@/lib/constants/textbook-subject-categories'
import { shiftDateKey } from '@/lib/study/dates'

export type AchievementMetrics = {
  studyLogCount: number
  totalStudyMinutes: number
  maxStudyStreak: number
  maxDailyStudyMinutes: number
  maxSingleSubjectDailyMinutes: number
  maxSubjectsInOneDay: number
  textbookCount: number
  hasCoachingMonthWith4Plus: boolean
  hasTargetSchool: boolean
  hasBirthday: boolean
  hasOpenedAllMenus: boolean
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
  hasTargetSchool: boolean
  hasBirthday: boolean
  hasOpenedAllMenus: boolean
}): AchievementMetrics {
  const dailyMinutes = new Map<string, number>()
  const dailySubjects = new Map<string, Set<string>>()
  const dailySubjectMinutes = new Map<string, Map<string, number>>()
  let totalStudyMinutes = 0

  for (const log of input.studyLogs) {
    totalStudyMinutes += log.duration_minutes
    dailyMinutes.set(log.studied_on, (dailyMinutes.get(log.studied_on) ?? 0) + log.duration_minutes)

    const category = resolveStudySubjectCategory(log.subject) ?? log.subject
    const subjectSet = dailySubjects.get(log.studied_on) ?? new Set<string>()
    subjectSet.add(category)
    dailySubjects.set(log.studied_on, subjectSet)

    const subjectMinutesByDay = dailySubjectMinutes.get(log.studied_on) ?? new Map<string, number>()
    subjectMinutesByDay.set(category, (subjectMinutesByDay.get(category) ?? 0) + log.duration_minutes)
    dailySubjectMinutes.set(log.studied_on, subjectMinutesByDay)
  }

  const maxDailyStudyMinutes = Math.max(0, ...Array.from(dailyMinutes.values()))
  const maxSubjectsInOneDay = Math.max(
    0,
    ...Array.from(dailySubjects.values()).map((subjects) => subjects.size),
  )
  const maxSingleSubjectDailyMinutes = Math.max(
    0,
    ...Array.from(dailySubjectMinutes.values()).flatMap((subjectMinutes) =>
      Array.from(subjectMinutes.values()),
    ),
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
    maxSingleSubjectDailyMinutes,
    maxSubjectsInOneDay,
    textbookCount: input.textbookCount,
    hasCoachingMonthWith4Plus: Array.from(monthCounts.values()).some((count) => count >= 4),
    hasTargetSchool: input.hasTargetSchool,
    hasBirthday: input.hasBirthday,
    hasOpenedAllMenus: input.hasOpenedAllMenus,
  }
}

export function getUnlockableAchievementIds(
  metrics: AchievementMetrics,
  existingIds: Set<string>,
): string[] {
  const unlockable: string[] = []
  const has = (id: string) => existingIds.has(id) || unlockable.includes(id)

  if (!has('first_study_log') && metrics.studyLogCount >= 1) unlockable.push('first_study_log')
  if (!has('keep_going') && metrics.studyLogCount >= 1) unlockable.push('keep_going')
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
  if (!has('daily_13h') && metrics.maxDailyStudyMinutes >= 780) unlockable.push('daily_13h')

  if (!has('single_subject_6h') && metrics.maxSingleSubjectDailyMinutes >= 360) {
    unlockable.push('single_subject_6h')
  }

  if (!has('subjects_3_day') && metrics.maxSubjectsInOneDay >= 3) {
    unlockable.push('subjects_3_day')
  }

  if (!has('coaching_4_month') && metrics.hasCoachingMonthWith4Plus) {
    unlockable.push('coaching_4_month')
  }

  if (!has('dream_high') && metrics.hasTargetSchool) unlockable.push('dream_high')
  if (!has('rat_year') && metrics.hasBirthday) unlockable.push('rat_year')
  if (!has('all_menus') && metrics.hasOpenedAllMenus) unlockable.push('all_menus')

  return unlockable
}

import { isUnreadEligibleContent } from '@/lib/account/content-cutoff'
import { isVocabularyTextbook } from '@/lib/constants/textbook-tags'
import { resolveStudySubjectCategory } from '@/lib/constants/textbook-subject-categories'
import { getJstDateKey, shiftDateKey } from '@/lib/study/dates'

export type AchievementMetrics = {
  studyLogCount: number
  totalStudyMinutes: number
  vocabularyStudyMinutes: number
  maxStudyStreak: number
  maxDailyStudyMinutes: number
  maxSingleSubjectDailyMinutes: number
  maxSubjectsInOneDay: number
  textbookCount: number
  completedCoachingCount: number
  hasCoachingMonthWith4Plus: boolean
  eligibleAnnouncementReadCount: number
  studyHistoryViewCount: number
  studentChatMessageCount: number
  hasTargetSchool: boolean
  hasBirthday: boolean
  hasOpenedAllMenus: boolean
  hasFirstBirthdaySinceRegistration: boolean
}

type StudyLogRow = {
  subject: string
  duration_minutes: number
  studied_on: string
  textbook_id: string | null
}

type TextbookRow = {
  id: string
  usage_tags: string[]
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

/** 登録日以降に最初の誕生日を迎えたか */
export function hasFirstBirthdaySinceRegistration(
  birthday: string | null | undefined,
  registeredAt: string | null | undefined,
  todayKey = getJstDateKey(),
): boolean {
  if (!birthday || !registeredAt) return false

  const [, month, day] = birthday.split('-')
  if (!month || !day) return false

  const registeredDateKey = registeredAt.slice(0, 10)
  const registeredYear = Number(registeredDateKey.slice(0, 4))
  const registeredMonthDay = registeredDateKey.slice(5)
  const birthdayMonthDay = `${month}-${day}`

  let firstBirthdayYear = registeredYear
  if (birthdayMonthDay < registeredMonthDay) {
    firstBirthdayYear += 1
  }

  const firstBirthdayKey = `${firstBirthdayYear}-${month}-${day}`
  return todayKey >= firstBirthdayKey
}

export function buildAchievementMetrics(input: {
  studyLogs: StudyLogRow[]
  textbooks: TextbookRow[]
  textbookCount: number
  coachingBookings: CoachingBookingRow[]
  eligibleAnnouncementReadCount: number
  studyHistoryViewCount: number
  studentChatMessageCount: number
  hasTargetSchool: boolean
  hasBirthday: boolean
  hasOpenedAllMenus: boolean
  hasFirstBirthdaySinceRegistration: boolean
}): AchievementMetrics {
  const vocabularyTextbookIds = new Set(
    input.textbooks.filter((book) => isVocabularyTextbook(book.usage_tags)).map((book) => book.id),
  )

  const dailyMinutes = new Map<string, number>()
  const dailySubjects = new Map<string, Set<string>>()
  const dailySubjectMinutes = new Map<string, Map<string, number>>()
  let totalStudyMinutes = 0
  let vocabularyStudyMinutes = 0

  for (const log of input.studyLogs) {
    totalStudyMinutes += log.duration_minutes
    if (log.textbook_id && vocabularyTextbookIds.has(log.textbook_id)) {
      vocabularyStudyMinutes += log.duration_minutes
    }

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
  let completedCoachingCount = 0
  for (const booking of input.coachingBookings) {
    if (booking.status === 'completed') {
      completedCoachingCount += 1
    }
    if (booking.status === 'cancelled' || !booking.slot_date) continue
    const monthKey = booking.slot_date.slice(0, 7)
    monthCounts.set(monthKey, (monthCounts.get(monthKey) ?? 0) + 1)
  }

  return {
    studyLogCount: input.studyLogs.length,
    totalStudyMinutes,
    vocabularyStudyMinutes,
    maxStudyStreak: computeMaxStudyStreak(input.studyLogs.map((log) => log.studied_on)),
    maxDailyStudyMinutes,
    maxSingleSubjectDailyMinutes,
    maxSubjectsInOneDay,
    textbookCount: input.textbookCount,
    completedCoachingCount,
    hasCoachingMonthWith4Plus: Array.from(monthCounts.values()).some((count) => count >= 4),
    eligibleAnnouncementReadCount: input.eligibleAnnouncementReadCount,
    studyHistoryViewCount: input.studyHistoryViewCount,
    studentChatMessageCount: input.studentChatMessageCount,
    hasTargetSchool: input.hasTargetSchool,
    hasBirthday: input.hasBirthday,
    hasOpenedAllMenus: input.hasOpenedAllMenus,
    hasFirstBirthdaySinceRegistration: input.hasFirstBirthdaySinceRegistration,
  }
}

export function countEligibleAnnouncementReads(
  reads: Array<{ announcement_id: string }>,
  announcementsById: Map<string, { created_at: string }>,
  accountCreatedAt: string,
): number {
  let count = 0
  for (const read of reads) {
    const announcement = announcementsById.get(read.announcement_id)
    if (!announcement) continue
    if (isUnreadEligibleContent(announcement.created_at, accountCreatedAt)) {
      count += 1
    }
  }
  return count
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
  if (!has('single_subject_10h') && metrics.maxSingleSubjectDailyMinutes >= 600) {
    unlockable.push('single_subject_10h')
  }

  if (!has('vocab_3h') && metrics.vocabularyStudyMinutes >= 180) unlockable.push('vocab_3h')
  if (!has('vocab_30h') && metrics.vocabularyStudyMinutes >= 1800) unlockable.push('vocab_30h')
  if (!has('vocab_75h') && metrics.vocabularyStudyMinutes >= 4500) unlockable.push('vocab_75h')
  if (!has('vocab_200h') && metrics.vocabularyStudyMinutes >= 12000) unlockable.push('vocab_200h')
  if (!has('vocab_500h') && metrics.vocabularyStudyMinutes >= 30000) unlockable.push('vocab_500h')

  if (!has('subjects_3_day') && metrics.maxSubjectsInOneDay >= 3) {
    unlockable.push('subjects_3_day')
  }

  if (!has('coaching_first') && metrics.completedCoachingCount >= 1) {
    unlockable.push('coaching_first')
  }
  if (!has('coaching_10') && metrics.completedCoachingCount >= 10) unlockable.push('coaching_10')
  if (!has('coaching_20') && metrics.completedCoachingCount >= 20) unlockable.push('coaching_20')
  if (!has('coaching_50') && metrics.completedCoachingCount >= 50) unlockable.push('coaching_50')

  if (!has('coaching_4_month') && metrics.hasCoachingMonthWith4Plus) {
    unlockable.push('coaching_4_month')
  }

  if (!has('announcement_read') && metrics.eligibleAnnouncementReadCount >= 1) {
    unlockable.push('announcement_read')
  }
  if (!has('announcement_read_5') && metrics.eligibleAnnouncementReadCount >= 5) {
    unlockable.push('announcement_read_5')
  }

  if (!has('study_history_views_10') && metrics.studyHistoryViewCount >= 10) {
    unlockable.push('study_history_views_10')
  }

  if (!has('dream_high') && metrics.hasTargetSchool) unlockable.push('dream_high')
  if (!has('rat_year') && metrics.hasBirthday) unlockable.push('rat_year')
  if (!has('all_menus') && metrics.hasOpenedAllMenus) unlockable.push('all_menus')
  if (!has('birthday_since_registration') && metrics.hasFirstBirthdaySinceRegistration) {
    unlockable.push('birthday_since_registration')
  }

  if (!has('chat_messages_5') && metrics.studentChatMessageCount >= 5) {
    unlockable.push('chat_messages_5')
  }
  if (!has('chat_messages_20') && metrics.studentChatMessageCount >= 20) {
    unlockable.push('chat_messages_20')
  }
  if (!has('chat_messages_50') && metrics.studentChatMessageCount >= 50) {
    unlockable.push('chat_messages_50')
  }

  return unlockable
}

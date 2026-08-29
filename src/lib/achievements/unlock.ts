import { revalidatePath } from 'next/cache'
import {
  ACHIEVEMENT_MENU_PAGE_KEYS,
  STUDY_HISTORY_PAGE_KEY,
  getAchievementDefinition,
} from '@/lib/achievements/definitions'
import {
  buildAchievementMetrics,
  countEligibleAnnouncementReads,
  getUnlockableAchievementIds,
  hasFirstBirthdaySinceRegistration,
} from '@/lib/achievements/metrics'
import { createClient } from '@/lib/supabase/server'
import { fetchExamSchedulesForStudent } from '@/lib/schedule/queries'

const CALENDAR_PAGE_KEY = '/dashboard/calendar'

export type UnlockedAchievement = {
  id: string
  title: string
  description: string
  stars: number
}

function toUnlockedAchievement(id: string): UnlockedAchievement | null {
  const definition = getAchievementDefinition(id)
  if (!definition) return null
  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    stars: definition.stars,
  }
}

async function insertUnlockedAchievements(
  studentId: string,
  unlockableIds: string[],
): Promise<UnlockedAchievement[]> {
  if (unlockableIds.length === 0) return []

  const supabase = await createClient()
  const { error } = await supabase.from('student_achievements').insert(
    unlockableIds.map((achievementId) => ({
      student_id: studentId,
      achievement_id: achievementId,
    })),
  )

  if (error) {
    console.error('[achievements] unlock insert failed:', error)
    return []
  }

  revalidatePath('/dashboard/achievements')
  revalidatePath('/dashboard')

  return unlockableIds
    .map((id) => toUnlockedAchievement(id))
    .filter((item): item is UnlockedAchievement => item != null)
}

export async function unlockAchievementIds(
  studentId: string,
  candidateIds: string[],
  existingIds?: Set<string>,
): Promise<UnlockedAchievement[]> {
  if (candidateIds.length === 0) return []

  const supabase = await createClient()
  let knownIds = existingIds

  if (!knownIds) {
    const { data: existingRows } = await supabase
      .from('student_achievements')
      .select('achievement_id')
      .eq('student_id', studentId)
    knownIds = new Set((existingRows ?? []).map((row) => String(row.achievement_id)))
  }

  const unlockableIds = candidateIds.filter((id) => !knownIds!.has(id))
  return insertUnlockedAchievements(studentId, unlockableIds)
}

async function loadAchievementEvaluationContext(studentId: string) {
  const supabase = await createClient()

  const [
    { data: existingRows },
    { data: studyLogs },
    { data: textbooks },
    { count: textbookCount },
    { data: coachingBookings },
    { data: coachingSlots },
    { data: profile },
    { data: pageVisits },
    { data: announcementReads },
    { count: studentChatMessageCount },
    { data: studentChatMessages },
    { count: homeworkCompletionCount },
    { count: quizCompletionCount },
    { count: applicationCompletionCount },
  ] = await Promise.all([
    supabase
      .from('student_achievements')
      .select('achievement_id')
      .eq('student_id', studentId),
    supabase
      .from('study_logs')
      .select('subject, duration_minutes, studied_on, textbook_id, content, created_at')
      .eq('student_id', studentId),
    supabase.from('textbooks').select('id, detail_tags').eq('student_id', studentId),
    supabase
      .from('textbooks')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId),
    supabase
      .from('coaching_bookings')
      .select('status, slot_id')
      .eq('student_id', studentId),
    supabase.from('coaching_slots').select('id, slot_date'),
    supabase
      .from('profiles')
      .select('birthday, target_schools, created_at')
      .eq('id', studentId)
      .single(),
    supabase
      .from('student_page_visits')
      .select('page_key, visit_count')
      .eq('student_id', studentId),
    supabase
      .from('announcement_reads')
      .select('announcement_id')
      .eq('student_id', studentId),
    supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('sender_id', studentId),
    supabase
      .from('chat_messages')
      .select('created_at')
      .eq('student_id', studentId)
      .eq('sender_id', studentId),
    supabase
      .from('homework_completions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId),
    supabase
      .from('quiz_schedule_completions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId),
    supabase
      .from('application_task_completions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId),
  ])

  const examSchedules = await fetchExamSchedulesForStudent(studentId)
  const hasOwnExamSchedule = examSchedules.some(
    (schedule) => schedule.exam_type === 'mock_exam' || schedule.exam_type === 'quiz',
  )

  const slotDateById = new Map(
    (coachingSlots ?? []).map((slot) => [String(slot.id), String(slot.slot_date)]),
  )

  const visitedPageKeys = new Set((pageVisits ?? []).map((row) => String(row.page_key)))
  const hasOpenedAllMenus = ACHIEVEMENT_MENU_PAGE_KEYS.every((pageKey) =>
    visitedPageKeys.has(pageKey),
  )

  const studyHistoryVisit = (pageVisits ?? []).find(
    (row) => String(row.page_key) === STUDY_HISTORY_PAGE_KEY,
  )
  const studyHistoryViewCount = Number(studyHistoryVisit?.visit_count ?? 0)
  const completedTodoCount =
    (homeworkCompletionCount ?? 0) + (quizCompletionCount ?? 0) + (applicationCompletionCount ?? 0)
  const hasCalendarExamView = visitedPageKeys.has(CALENDAR_PAGE_KEY) && hasOwnExamSchedule

  const targetSchools = Array.isArray(profile?.target_schools) ? profile.target_schools : []
  const accountCreatedAt = String(profile?.created_at ?? '')
  const readAnnouncementIds = (announcementReads ?? []).map((row) => String(row.announcement_id))

  let eligibleAnnouncementReadCount = 0
  if (readAnnouncementIds.length > 0 && accountCreatedAt) {
    const { data: announcements } = await supabase
      .from('announcements')
      .select('id, created_at')
      .in('id', readAnnouncementIds)

    const announcementsById = new Map(
      (announcements ?? []).map((row) => [
        String(row.id),
        { created_at: String(row.created_at) },
      ]),
    )

    eligibleAnnouncementReadCount = countEligibleAnnouncementReads(
      (announcementReads ?? []).map((row) => ({
        announcement_id: String(row.announcement_id),
      })),
      announcementsById,
      accountCreatedAt,
    )
  }

  return {
    existingIds: new Set((existingRows ?? []).map((row) => String(row.achievement_id))),
    metrics: buildAchievementMetrics({
      studyLogs: (studyLogs ?? []).map((log) => ({
        subject: String(log.subject),
        duration_minutes: Number(log.duration_minutes),
        studied_on: String(log.studied_on),
        textbook_id: log.textbook_id ? String(log.textbook_id) : null,
        content: log.content ? String(log.content) : undefined,
        created_at: log.created_at ? String(log.created_at) : undefined,
      })),
      textbooks: (textbooks ?? []).map((book) => ({
        id: String(book.id),
        detail_tags: Array.isArray(book.detail_tags) ? book.detail_tags.map(String) : [],
      })),
      textbookCount: textbookCount ?? 0,
      coachingBookings: (coachingBookings ?? []).map((row) => ({
        status: String(row.status),
        slot_date: row.slot_id ? slotDateById.get(String(row.slot_id)) ?? null : null,
      })),
      eligibleAnnouncementReadCount,
      studyHistoryViewCount,
      studentChatMessageCount: studentChatMessageCount ?? 0,
      studentChatMessages: (studentChatMessages ?? []).map((message) => ({
        created_at: String(message.created_at),
      })),
      completedTodoCount,
      hasCalendarExamView,
      hasTargetSchool: targetSchools.some((school) => String(school).trim().length > 0),
      hasBirthday: Boolean(profile?.birthday),
      hasOpenedAllMenus,
      hasFirstBirthdaySinceRegistration: hasFirstBirthdaySinceRegistration(
        profile?.birthday ? String(profile.birthday) : null,
        accountCreatedAt || null,
      ),
    }),
  }
}

export async function evaluateAndUnlockAchievements(
  studentId: string,
): Promise<UnlockedAchievement[]> {
  const { existingIds, metrics } = await loadAchievementEvaluationContext(studentId)
  const unlockableIds = getUnlockableAchievementIds(metrics, existingIds)
  return insertUnlockedAchievements(studentId, unlockableIds)
}

export async function evaluateProfileAchievements(
  studentId: string,
): Promise<UnlockedAchievement[]> {
  return evaluateAndUnlockAchievements(studentId)
}

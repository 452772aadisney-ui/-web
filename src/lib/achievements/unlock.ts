import { revalidatePath } from 'next/cache'
import {
  ACHIEVEMENT_MENU_PAGE_KEYS,
  getAchievementDefinition,
} from '@/lib/achievements/definitions'
import {
  buildAchievementMetrics,
  getUnlockableAchievementIds,
} from '@/lib/achievements/metrics'
import { createClient } from '@/lib/supabase/server'

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
    { count: textbookCount },
    { data: coachingBookings },
    { data: coachingSlots },
    { data: profile },
    { data: pageVisits },
  ] = await Promise.all([
    supabase
      .from('student_achievements')
      .select('achievement_id')
      .eq('student_id', studentId),
    supabase
      .from('study_logs')
      .select('subject, duration_minutes, studied_on')
      .eq('student_id', studentId),
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
      .select('birthday, target_schools')
      .eq('id', studentId)
      .single(),
    supabase.from('student_page_visits').select('page_key').eq('student_id', studentId),
  ])

  const slotDateById = new Map(
    (coachingSlots ?? []).map((slot) => [String(slot.id), String(slot.slot_date)]),
  )

  const visitedPageKeys = new Set((pageVisits ?? []).map((row) => String(row.page_key)))
  const hasOpenedAllMenus = ACHIEVEMENT_MENU_PAGE_KEYS.every((pageKey) =>
    visitedPageKeys.has(pageKey),
  )

  const targetSchools = Array.isArray(profile?.target_schools) ? profile.target_schools : []

  return {
    existingIds: new Set((existingRows ?? []).map((row) => String(row.achievement_id))),
    metrics: buildAchievementMetrics({
      studyLogs: (studyLogs ?? []).map((log) => ({
        subject: String(log.subject),
        duration_minutes: Number(log.duration_minutes),
        studied_on: String(log.studied_on),
      })),
      textbookCount: textbookCount ?? 0,
      coachingBookings: (coachingBookings ?? []).map((row) => ({
        status: String(row.status),
        slot_date: row.slot_id ? slotDateById.get(String(row.slot_id)) ?? null : null,
      })),
      hasTargetSchool: targetSchools.some((school) => String(school).trim().length > 0),
      hasBirthday: Boolean(profile?.birthday),
      hasOpenedAllMenus,
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

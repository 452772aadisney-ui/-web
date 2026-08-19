import { revalidatePath } from 'next/cache'
import { getAchievementDefinition } from '@/lib/achievements/definitions'
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

export async function evaluateAndUnlockAchievements(
  studentId: string,
): Promise<UnlockedAchievement[]> {
  const supabase = await createClient()

  const [
    { data: existingRows },
    { data: studyLogs },
    { count: textbookCount },
    { data: coachingBookings },
    { data: coachingSlots },
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
  ])

  const slotDateById = new Map(
    (coachingSlots ?? []).map((slot) => [String(slot.id), String(slot.slot_date)]),
  )

  const existingIds = new Set((existingRows ?? []).map((row) => String(row.achievement_id)))

  const metrics = buildAchievementMetrics({
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
  })

  const unlockableIds = getUnlockableAchievementIds(metrics, existingIds)
  if (unlockableIds.length === 0) return []

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

import { createClient } from '@/lib/supabase/server'
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_SERIES,
  type AchievementDefinition,
} from '@/lib/achievements/definitions'

export type AchievementListItem = AchievementDefinition & {
  unlocked: boolean
  unlockedAt: string | null
}

export async function fetchStudentAchievements(studentId: string): Promise<{
  items: AchievementListItem[]
  unlockedCount: number
  totalCount: number
}> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('student_achievements')
    .select('achievement_id, unlocked_at')
    .eq('student_id', studentId)

  const unlockedAtById = new Map(
    (data ?? []).map((row) => [String(row.achievement_id), String(row.unlocked_at)]),
  )

  const items = ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    unlocked: unlockedAtById.has(achievement.id),
    unlockedAt: unlockedAtById.get(achievement.id) ?? null,
  }))

  return {
    items,
    unlockedCount: items.filter((item) => item.unlocked).length,
    totalCount: items.length,
  }
}

/** 系統ごとに達成済み＋次の1件（未達成）のみ返す */
export function getVisibleAchievements(items: AchievementListItem[]): AchievementListItem[] {
  const itemById = new Map(items.map((item) => [item.id, item]))
  const visible: AchievementListItem[] = []

  for (const series of ACHIEVEMENT_SERIES) {
    const seriesItems = series
      .map((id) => itemById.get(id))
      .filter((item): item is AchievementListItem => item != null)

    let nextLockedShown = false
    for (const item of seriesItems) {
      if (item.unlocked) {
        visible.push(item)
        continue
      }
      if (!nextLockedShown) {
        visible.push(item)
        nextLockedShown = true
      }
    }
  }

  return visible
}

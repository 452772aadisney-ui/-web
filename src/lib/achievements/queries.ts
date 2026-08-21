import { createClient } from '@/lib/supabase/server'
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_SERIES,
  isSecretAchievement,
  type AchievementDefinition,
} from '@/lib/achievements/definitions'

export type AchievementListItem = AchievementDefinition & {
  unlocked: boolean
  unlockedAt: string | null
}

function mapAchievementItems(
  achievements: AchievementDefinition[],
  unlockedAtById: Map<string, string>,
): AchievementListItem[] {
  return achievements.map((achievement) => ({
    ...achievement,
    unlocked: unlockedAtById.has(achievement.id),
    unlockedAt: unlockedAtById.get(achievement.id) ?? null,
  }))
}

export async function fetchStudentAchievements(studentId: string): Promise<{
  publicItems: AchievementListItem[]
  secretItems: AchievementListItem[]
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

  const publicAchievements = ACHIEVEMENTS.filter((achievement) => !achievement.secret)
  const secretAchievements = ACHIEVEMENTS.filter((achievement) => achievement.secret)

  const publicItems = mapAchievementItems(publicAchievements, unlockedAtById)
  const secretItems = mapAchievementItems(secretAchievements, unlockedAtById)
  const allItems = [...publicItems, ...secretItems]

  return {
    publicItems,
    secretItems,
    unlockedCount: allItems.filter((item) => item.unlocked).length,
    totalCount: allItems.length,
  }
}

/** 系統ごとに達成済み＋次の1件（未達成）のみ返す（公開実績のみ） */
export function getVisibleAchievements(items: AchievementListItem[]): AchievementListItem[] {
  const itemById = new Map(items.map((item) => [item.id, item]))
  const visible: AchievementListItem[] = []

  for (const series of ACHIEVEMENT_SERIES) {
    const seriesItems = series
      .map((id) => itemById.get(id))
      .filter((item): item is AchievementListItem => item != null)

    let nextLockedShown = false
    for (const item of seriesItems) {
      if (isSecretAchievement(item.id)) continue
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

/** 未達成を上、達成済みを下に並べ替える（解除済みシークレット実績を達成済みに含める） */
export function splitVisibleAchievements(
  publicItems: AchievementListItem[],
  secretItems: AchievementListItem[],
): {
  lockedItems: AchievementListItem[]
  unlockedItems: AchievementListItem[]
} {
  const visiblePublic = getVisibleAchievements(publicItems)
  const unlockedSecrets = secretItems.filter((item) => item.unlocked)

  return {
    lockedItems: visiblePublic.filter((item) => !item.unlocked),
    unlockedItems: [
      ...visiblePublic.filter((item) => item.unlocked),
      ...unlockedSecrets,
    ],
  }
}

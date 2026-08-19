import { createClient } from '@/lib/supabase/server'
import {
  ACHIEVEMENTS,
  type AchievementCategory,
  type AchievementDefinition,
} from '@/lib/achievements/definitions'

export type AchievementListItem = AchievementDefinition & {
  unlocked: boolean
  unlockedAt: string | null
}

export type AchievementListGroup = {
  category: AchievementCategory
  label: string
  items: AchievementListItem[]
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

export function groupAchievements(items: AchievementListItem[]): AchievementListGroup[] {
  const groups: AchievementListGroup[] = [
    {
      category: 'beginner',
      label: '初期離脱を防ぐビギナー実績（登録・準備系）',
      items: items.filter((item) => item.category === 'beginner'),
    },
    {
      category: 'streak',
      label: '毎日アプリを開かせる継続実績（最重要）',
      items: items.filter((item) => item.category === 'streak'),
    },
    {
      category: 'total',
      label: '努力を可視化する累積実績（時間・量）',
      items: items.filter((item) => item.category === 'total' || item.category === 'daily'),
    },
    {
      category: 'balance',
      label: 'バランス・行動促進実績',
      items: items.filter((item) => item.category === 'balance'),
    },
  ]

  return groups.filter((group) => group.items.length > 0)
}

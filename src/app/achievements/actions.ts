'use server'

import { normalizeAchievementVisitPath } from '@/lib/achievements/definitions'
import {
  evaluateAndUnlockAchievements,
  type UnlockedAchievement,
} from '@/lib/achievements/unlock'
import { createClient } from '@/lib/supabase/server'

export async function recordStudentPageVisit(pathname: string): Promise<UnlockedAchievement[]> {
  const pageKey = normalizeAchievementVisitPath(pathname)
  if (!pageKey) return []

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'student') return []

  const { error: visitError } = await supabase.from('student_page_visits').upsert(
    {
      student_id: user.id,
      page_key: pageKey,
    },
    { onConflict: 'student_id,page_key' },
  )

  if (visitError) {
    console.error('[achievements] page visit upsert failed:', visitError)
    return []
  }

  return evaluateAndUnlockAchievements(user.id)
}

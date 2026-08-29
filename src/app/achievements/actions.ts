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

  const { data: existingVisit } = await supabase
    .from('student_page_visits')
    .select('visit_count')
    .eq('student_id', user.id)
    .eq('page_key', pageKey)
    .maybeSingle()

  const nextVisitCount = Number(existingVisit?.visit_count ?? 0) + 1

  const { error: visitError } = await supabase.from('student_page_visits').upsert(
    {
      student_id: user.id,
      page_key: pageKey,
      visit_count: nextVisitCount,
    },
    { onConflict: 'student_id,page_key' },
  )

  if (visitError) {
    console.error('[achievements] page visit upsert failed:', visitError)
    return []
  }

  const { error: accessError } = await supabase
    .from('profiles')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('id', user.id)

  if (accessError) {
    console.error('[achievements] last_accessed_at update failed:', accessError)
  }

  return evaluateAndUnlockAchievements(user.id)
}

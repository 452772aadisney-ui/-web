import { getAchievementDefinition } from '@/lib/achievements/definitions'
import { createAdminClient } from '@/lib/supabase/admin'

export type StudentStarRanking = {
  totalStars: number
  rank: number
  rankingPoolSize: number
}

export function computeStarRank(
  studentId: string,
  starTotalsByStudentId: Map<string, number>,
  registeredStudentCount: number,
): StudentStarRanking {
  const rankingPoolSize = registeredStudentCount + 10
  const totalStars = starTotalsByStudentId.get(studentId) ?? 0

  if (totalStars <= 0) {
    return { totalStars: 0, rank: rankingPoolSize, rankingPoolSize }
  }

  let higherCount = 0
  for (const [id, stars] of starTotalsByStudentId) {
    if (id === studentId) continue
    if (stars > totalStars) higherCount += 1
  }

  return {
    totalStars,
    rank: higherCount + 1,
    rankingPoolSize,
  }
}

function buildStarTotalsByStudent(
  studentIds: string[],
  achievementRows: Array<{ student_id: string; achievement_id: string }>,
): Map<string, number> {
  const starTotals = new Map<string, number>()
  for (const studentId of studentIds) {
    starTotals.set(studentId, 0)
  }

  for (const row of achievementRows) {
    const stars = getAchievementDefinition(String(row.achievement_id))?.stars ?? 0
    if (stars <= 0) continue
    const studentId = String(row.student_id)
    starTotals.set(studentId, (starTotals.get(studentId) ?? 0) + stars)
  }

  return starTotals
}

export async function fetchStudentStarRanking(studentId: string): Promise<StudentStarRanking | null> {
  const supabase = createAdminClient()
  if (!supabase) return null

  const [{ count: registeredStudentCount }, { data: students }, { data: achievements }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'student'),
      supabase.from('profiles').select('id').eq('role', 'student'),
      supabase.from('student_achievements').select('student_id, achievement_id'),
    ])

  const studentIds = (students ?? []).map((student) => String(student.id))
  if (studentIds.length === 0) {
    return { totalStars: 0, rank: 10, rankingPoolSize: 10 }
  }

  const starTotals = buildStarTotalsByStudent(
    studentIds,
    (achievements ?? []).map((row) => ({
      student_id: String(row.student_id),
      achievement_id: String(row.achievement_id),
    })),
  )

  return computeStarRank(studentId, starTotals, registeredStudentCount ?? studentIds.length)
}

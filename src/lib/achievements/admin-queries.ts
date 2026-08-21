import {
  ACHIEVEMENTS,
  formatAchievementStars,
  getAchievementDefinition,
  type AchievementCategory,
} from '@/lib/achievements/definitions'
import { computeStarRank } from '@/lib/achievements/ranking'
import { getPersonName } from '@/lib/auth/display-name'
import { createAdminClient } from '@/lib/supabase/admin'

export type AdminStudentRankingRow = {
  studentId: string
  name: string
  totalStars: number
  rank: number
  unlockedCount: number
}

export type AdminAchievementUnlockRow = {
  studentId: string
  name: string
  unlockedAt: string
}

export type AdminAchievementStatusRow = {
  id: string
  title: string
  description: string
  stars: number
  starsLabel: string
  category: AchievementCategory
  secret: boolean
  unlockedCount: number
  totalStudents: number
  unlockedStudents: AdminAchievementUnlockRow[]
}

export type AdminAchievementOverview = {
  registeredStudentCount: number
  rankingPoolSize: number
  rankings: AdminStudentRankingRow[]
  achievements: AdminAchievementStatusRow[]
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

export async function fetchAdminAchievementOverview(): Promise<AdminAchievementOverview | null> {
  const supabase = createAdminClient()
  if (!supabase) return null

  const [{ count: registeredStudentCount }, { data: students }, { data: achievementRows }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'student'),
      supabase.from('profiles').select('id, full_name, display_name').eq('role', 'student'),
      supabase
        .from('student_achievements')
        .select('student_id, achievement_id, unlocked_at')
        .order('unlocked_at', { ascending: false }),
    ])

  const studentList = students ?? []
  const studentIds = studentList.map((student) => String(student.id))
  const studentCount = registeredStudentCount ?? studentIds.length
  const rankingPoolSize = studentCount + 10
  const nameById = new Map(
    studentList.map((student) => [
      String(student.id),
      getPersonName({
        full_name: String(student.full_name),
        display_name: student.display_name ? String(student.display_name) : null,
      }),
    ]),
  )

  const rows = achievementRows ?? []
  const starTotals = buildStarTotalsByStudent(
    studentIds,
    rows.map((row) => ({
      student_id: String(row.student_id),
      achievement_id: String(row.achievement_id),
    })),
  )

  const unlockedCountByStudent = new Map<string, number>()
  for (const studentId of studentIds) {
    unlockedCountByStudent.set(studentId, 0)
  }
  for (const row of rows) {
    const studentId = String(row.student_id)
    unlockedCountByStudent.set(studentId, (unlockedCountByStudent.get(studentId) ?? 0) + 1)
  }

  const rankings = studentIds
    .map((studentId) => {
      const ranking = computeStarRank(studentId, starTotals, studentCount)
      return {
        studentId,
        name: nameById.get(studentId) ?? '名前未設定',
        totalStars: ranking.totalStars,
        rank: ranking.rank,
        unlockedCount: unlockedCountByStudent.get(studentId) ?? 0,
      }
    })
    .sort((a, b) => a.rank - b.rank || b.totalStars - a.totalStars || a.name.localeCompare(b.name, 'ja'))

  const unlocksByAchievement = new Map<string, AdminAchievementUnlockRow[]>()
  for (const row of rows) {
    const achievementId = String(row.achievement_id)
    const studentId = String(row.student_id)
    const unlocks = unlocksByAchievement.get(achievementId) ?? []
    unlocks.push({
      studentId,
      name: nameById.get(studentId) ?? '名前未設定',
      unlockedAt: String(row.unlocked_at),
    })
    unlocksByAchievement.set(achievementId, unlocks)
  }

  const achievements = ACHIEVEMENTS.map((definition) => {
    const unlockedStudents = unlocksByAchievement.get(definition.id) ?? []
    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      stars: definition.stars,
      starsLabel: formatAchievementStars(definition.stars),
      category: definition.category,
      secret: definition.secret === true,
      unlockedCount: unlockedStudents.length,
      totalStudents: studentCount,
      unlockedStudents,
    }
  })

  return {
    registeredStudentCount: studentCount,
    rankingPoolSize,
    rankings,
    achievements,
  }
}

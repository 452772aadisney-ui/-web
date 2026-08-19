import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { AchievementList } from '@/components/achievements/AchievementList'
import { fetchStudentAchievements, groupAchievements } from '@/lib/achievements/queries'

export default async function StudentAchievementsPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'student') redirect(getDashboardPathForRole(profile.role))

  const { items, unlockedCount, totalCount } = await fetchStudentAchievements(profile.id)
  const groups = groupAchievements(items)

  return (
    <StudentPageShell title="実績一覧" backHref="/dashboard" backLabel="マイページ">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-bold">実績一覧</h2>
        <p className="mb-6 text-sm text-muted">
          学習や登録の積み重ねで実績を解除できます。未達成はグレー表示です。
        </p>
        <AchievementList groups={groups} unlockedCount={unlockedCount} totalCount={totalCount} />
      </section>
    </StudentPageShell>
  )
}

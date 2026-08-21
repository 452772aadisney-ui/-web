import { redirect } from 'next/navigation'
import { fetchAdminAchievementOverview } from '@/lib/achievements/admin-queries'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminAchievementOverview } from '@/components/admin/AdminAchievementOverview'

export const dynamic = 'force-dynamic'

export default async function AdminAchievementsPage() {
  const profile = await getCurrentProfile()

  if (!profile) {
    redirect('/login')
  }

  if (profile.role !== 'admin') {
    redirect(getDashboardPathForRole('student'))
  }

  const overview = await fetchAdminAchievementOverview()

  return (
    <AdminPageShell title="実績・ランキング" backHref="/admin" backLabel="管理画面" wide>
      {!overview ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          実績データを読み込めませんでした。Supabase のサービスロールキーを確認してください。
        </section>
      ) : (
        <AdminAchievementOverview overview={overview} />
      )}
    </AdminPageShell>
  )
}

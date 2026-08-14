import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminBookshelfManager } from '@/components/textbooks/AdminBookshelfManager'
import { fetchAdminBookshelfOverview } from '@/lib/textbooks/catalog-queries'

export default async function AdminBookshelfPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const overview = await fetchAdminBookshelfOverview()

  return (
    <AdminPageShell title="本棚" backHref="/admin" backLabel="管理画面" wide>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">管理者本棚</h2>
        <p className="mt-1 text-sm text-muted">
          管理者が登録した参考書マスタと、生徒が本棚に登録した参考書をすべて表示します。各参考書を利用している生徒名も確認できます。
        </p>
        <div className="mt-6">
          <AdminBookshelfManager overview={overview} />
        </div>
      </section>
    </AdminPageShell>
  )
}

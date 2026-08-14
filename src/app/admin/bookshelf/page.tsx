import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminBookshelfManager } from '@/components/textbooks/AdminBookshelfManager'
import {
  fetchTextbookCatalog,
  fetchTextbookCatalogUsage,
} from '@/lib/textbooks/catalog-queries'

export default async function AdminBookshelfPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const [catalog, usage] = await Promise.all([
    fetchTextbookCatalog(),
    fetchTextbookCatalogUsage(),
  ])

  return (
    <AdminPageShell title="本棚" backHref="/admin" backLabel="管理画面" wide>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-bold">管理者本棚</h2>
        <p className="mt-1 text-sm text-muted">
          参考書マスタを管理します。公開の参考書は全生徒がリストから選べ、非公開は登録済みの生徒と管理者のみ確認できます。
        </p>
        <div className="mt-6">
          <AdminBookshelfManager catalog={catalog} usage={usage} />
        </div>
      </section>
    </AdminPageShell>
  )
}

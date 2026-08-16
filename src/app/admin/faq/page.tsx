import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminFaqManager } from '@/components/faq/AdminFaqManager'
import { fetchFaqForAdmin } from '@/lib/faq/queries'

export const dynamic = 'force-dynamic'

export default async function AdminFaqPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const categories = await fetchFaqForAdmin()

  return (
    <AdminPageShell title="FAQ管理" backHref="/admin" backLabel="管理画面">
      <p className="mb-6 text-sm text-muted">
        生徒向けのよくある質問をカテゴリごとに管理できます。公開チェックを外すと生徒画面には表示されません。
      </p>
      <AdminFaqManager categories={categories} />
    </AdminPageShell>
  )
}

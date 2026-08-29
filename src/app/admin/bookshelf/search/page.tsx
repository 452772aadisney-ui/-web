import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminBookshelfNav } from '@/components/textbooks/AdminBookshelfNav'
import { TextbookSearchMenu } from '@/components/textbooks/TextbookSearchMenu'

export default async function AdminBookshelfSearchPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  return (
    <AdminPageShell title="参考書を検索" backHref="/admin" backLabel="管理画面" wide>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <AdminBookshelfNav active="search" />
        <TextbookSearchMenu
          basePath="/admin/bookshelf/search"
          createHref="/admin/bookshelf/create"
          createLinkLabel="新規参考書を登録"
          includeStudentRegistered
        />
      </section>
    </AdminPageShell>
  )
}

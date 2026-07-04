import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminTagManager } from '@/components/tags/AdminTagManager'
import { fetchStudentTags } from '@/lib/tags/queries'

export default async function AdminTagsPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const tags = await fetchStudentTags()

  return (
    <AdminPageShell title="生徒タグ管理" backHref="/admin" backLabel="管理画面">
      <p className="mb-6 text-sm text-muted">
        学年・系統などのタグを管理します。生徒詳細画面から各生徒にタグを付与できます。
      </p>
      <AdminTagManager tags={tags} />
    </AdminPageShell>
  )
}

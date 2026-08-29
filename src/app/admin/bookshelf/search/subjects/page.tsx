import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { TextbookSubjectTagFilter } from '@/components/textbooks/TextbookSubjectTagFilter'

export default async function AdminBookshelfSearchSubjectsPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  return (
    <AdminPageShell
      title="教科から探す"
      backHref="/admin/bookshelf/search"
      backLabel="検索メニュー"
      wide
    >
      <TextbookSubjectTagFilter basePath="/admin/bookshelf/search" />
    </AdminPageShell>
  )
}

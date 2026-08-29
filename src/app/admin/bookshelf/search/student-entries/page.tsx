import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminStudentRegisteredEntries } from '@/components/textbooks/AdminStudentRegisteredEntries'
import { groupStudentsByGrade } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'
import { fetchAdminBookshelfOverview } from '@/lib/textbooks/catalog-queries'
import { fetchStudentList } from '@/lib/study/queries'

export default async function AdminBookshelfStudentEntriesPage() {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const [overview, students, gradeTagByStudentId] = await Promise.all([
    fetchAdminBookshelfOverview(),
    fetchStudentList(),
    fetchGradeTagNamesByStudentId(),
  ])

  const studentGroups = groupStudentsByGrade(students, gradeTagByStudentId)

  return (
    <AdminPageShell
      title="生徒登録教材"
      backHref="/admin/bookshelf/search"
      backLabel="検索メニュー"
      wide
    >
      <AdminStudentRegisteredEntries overview={overview} studentGroups={studentGroups} />
    </AdminPageShell>
  )
}

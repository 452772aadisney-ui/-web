import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminStudentRegisteredEntries } from '@/components/textbooks/AdminStudentRegisteredEntries'
import { Pagination } from '@/components/ui/Pagination'
import { groupStudentsByGrade } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'
import { fetchStudentRegisteredEntriesPaginated } from '@/lib/textbooks/catalog-queries'
import { fetchTextbookPublisherOptions } from '@/lib/textbooks/publisher-options'
import { fetchStudentList } from '@/lib/study/queries'

export default async function AdminBookshelfStudentEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ entriesPage?: string }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const params = await searchParams
  const pageNumber = params.entriesPage ? parseInt(params.entriesPage, 10) : 1

  const [pageResult, students, gradeTagByStudentId, publishers] = await Promise.all([
    fetchStudentRegisteredEntriesPaginated({
      page: Number.isFinite(pageNumber) ? pageNumber : 1,
      pageSize: 20,
    }),
    fetchStudentList(),
    fetchGradeTagNamesByStudentId(),
    fetchTextbookPublisherOptions(),
  ])

  const studentGroups = groupStudentsByGrade(students, gradeTagByStudentId)

  return (
    <AdminPageShell
      title="生徒登録教材"
      backHref="/admin/bookshelf/search"
      backLabel="検索メニュー"
    >
      <AdminStudentRegisteredEntries
        entries={pageResult.entries}
        studentGroups={studentGroups}
        publishers={publishers}
      />
      <Pagination
        currentPage={pageResult.page}
        totalCount={pageResult.totalCount}
        pageSize={pageResult.pageSize}
        pageParam="entriesPage"
        pathname="/admin/bookshelf/search/student-entries"
      />
    </AdminPageShell>
  )
}

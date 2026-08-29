import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminTextbookCatalogSearchResults } from '@/components/textbooks/AdminTextbookCatalogSearchResults'
import { groupStudentsByGrade } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'
import {
  fetchAdminBookshelfOverview,
  fetchTextbookCatalog,
} from '@/lib/textbooks/catalog-queries'
import { fetchStudentList } from '@/lib/study/queries'

export default async function AdminBookshelfSearchResultsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    tags?: string
    publisher?: string
    university?: string
    purpose?: string
  }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const params = await searchParams
  const [catalog, overview, students, gradeTagByStudentId] = await Promise.all([
    fetchTextbookCatalog(),
    fetchAdminBookshelfOverview(),
    fetchStudentList(),
    fetchGradeTagNamesByStudentId(),
  ])

  const studentGroups = groupStudentsByGrade(students, gradeTagByStudentId)

  const title = params.q
    ? `「${params.q}」の検索結果`
    : params.publisher
      ? `${params.publisher}の参考書`
      : params.university
        ? `${params.university}向け`
        : params.purpose
          ? params.purpose
          : '参考書一覧'

  return (
    <AdminPageShell
      title={title}
      backHref="/admin/bookshelf/search"
      backLabel="検索メニュー"
      wide
    >
      <AdminTextbookCatalogSearchResults
        catalog={catalog}
        overview={overview}
        studentGroups={studentGroups}
        query={params.q}
        tags={params.tags}
        publisher={params.publisher}
        university={params.university}
        purpose={params.purpose}
      />
    </AdminPageShell>
  )
}

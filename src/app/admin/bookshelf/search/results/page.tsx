import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/get-profile'
import { getDashboardPathForRole } from '@/lib/auth/routes'
import { AdminPageShell } from '@/components/layout/AdminPageShell'
import { AdminTextbookCatalogSearchResults } from '@/components/textbooks/AdminTextbookCatalogSearchResults'
import { TextbookSearchMenu } from '@/components/textbooks/TextbookSearchMenu'
import { Pagination } from '@/components/ui/Pagination'
import { groupStudentsByGrade } from '@/lib/tags/grade-order'
import { fetchGradeTagNamesByStudentId } from '@/lib/tags/queries'
import {
  fetchCatalogUserCounts,
  searchTextbookCatalogPaginated,
} from '@/lib/textbooks/catalog-queries'
import { parseSearchListParam } from '@/lib/textbooks/catalog-filter'
import { fetchTextbookPublisherOptions } from '@/lib/textbooks/publisher-options'
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
    catalogPage?: string
  }>
}) {
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect(getDashboardPathForRole('student'))

  const params = await searchParams
  const pageNumber = params.catalogPage ? parseInt(params.catalogPage, 10) : 1

  const [searchResult, students, gradeTagByStudentId, publishers] = await Promise.all([
    searchTextbookCatalogPaginated({
      query: params.q,
      detailTags: parseSearchListParam(params.tags),
      publisher: params.publisher,
      university: params.university,
      purpose: params.purpose,
      publicOnly: false,
      searchableOnly: false,
      page: Number.isFinite(pageNumber) ? pageNumber : 1,
      pageSize: 20,
    }),
    fetchStudentList(),
    fetchGradeTagNamesByStudentId(),
    fetchTextbookPublisherOptions(),
  ])

  const userCountMap = await fetchCatalogUserCounts(searchResult.items.map((item) => item.id))
  const userCounts = Object.fromEntries(userCountMap.entries())
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
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <TextbookSearchMenu
            basePath="/admin/bookshelf/search"
            initialQuery={params.q ?? ''}
            compact
            includeStudentRegistered
          />
        </section>
        <AdminTextbookCatalogSearchResults
          catalog={searchResult.items}
          userCounts={userCounts}
          studentGroups={studentGroups}
          publishers={publishers}
        />
        <Pagination
          currentPage={searchResult.page}
          totalCount={searchResult.totalCount}
          pageSize={searchResult.pageSize}
          pageParam="catalogPage"
          pathname="/admin/bookshelf/search/results"
          preserveParams={{
            q: params.q,
            tags: params.tags,
            publisher: params.publisher,
            university: params.university,
            purpose: params.purpose,
          }}
        />
      </div>
    </AdminPageShell>
  )
}

import { redirect } from 'next/navigation'
import { requireProfile } from '@/app/profile/actions'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { TextbookCatalogSearchResults } from '@/components/textbooks/TextbookCatalogSearchResults'
import { TextbookSearchMenu } from '@/components/textbooks/TextbookSearchMenu'
import { Pagination } from '@/components/ui/Pagination'
import {
  fetchStudentCatalogIds,
  searchTextbookCatalogPaginated,
} from '@/lib/textbooks/catalog-queries'
import { parseSearchListParam } from '@/lib/textbooks/catalog-filter'

export default async function TextbookSearchResultsPage({
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
  const profile = await requireProfile()
  if (profile.role !== 'student') redirect('/dashboard')

  const params = await searchParams
  const pageNumber = params.catalogPage ? parseInt(params.catalogPage, 10) : 1

  const [searchResult, registeredCatalogIds] = await Promise.all([
    searchTextbookCatalogPaginated({
      query: params.q,
      detailTags: parseSearchListParam(params.tags),
      publisher: params.publisher,
      university: params.university,
      purpose: params.purpose,
      publicOnly: true,
      searchableOnly: true,
      page: Number.isFinite(pageNumber) ? pageNumber : 1,
      pageSize: 20,
    }),
    fetchStudentCatalogIds(profile.id),
  ])

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
    <StudentPageShell
      title={title}
      backHref="/dashboard/textbooks/search"
      backLabel="検索メニュー"
      mainClassName="max-w-4xl"
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <TextbookSearchMenu initialQuery={params.q ?? ''} compact />
        </section>
        <TextbookCatalogSearchResults
          catalog={searchResult.items}
          registeredCatalogIds={[...registeredCatalogIds]}
          studentId={profile.id}
          alreadyFiltered
        />
        <Pagination
          currentPage={searchResult.page}
          totalCount={searchResult.totalCount}
          pageSize={searchResult.pageSize}
          pageParam="catalogPage"
          pathname="/dashboard/textbooks/search/results"
          preserveParams={{
            q: params.q,
            tags: params.tags,
            publisher: params.publisher,
            university: params.university,
            purpose: params.purpose,
          }}
        />
      </div>
    </StudentPageShell>
  )
}

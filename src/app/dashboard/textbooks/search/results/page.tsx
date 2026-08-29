import { redirect } from 'next/navigation'
import { requireProfile } from '@/app/profile/actions'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { TextbookCatalogSearchResults } from '@/components/textbooks/TextbookCatalogSearchResults'
import {
  fetchStudentCatalogIds,
  fetchTextbookCatalogForStudent,
} from '@/lib/textbooks/catalog-queries'

export default async function TextbookSearchResultsPage({
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
  const profile = await requireProfile()
  if (profile.role !== 'student') redirect('/dashboard')

  const params = await searchParams
  const [catalog, registeredCatalogIds] = await Promise.all([
    fetchTextbookCatalogForStudent(profile.id),
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
      <TextbookCatalogSearchResults
        catalog={catalog}
        registeredCatalogIds={[...registeredCatalogIds]}
        studentId={profile.id}
        query={params.q}
        tags={params.tags}
        publisher={params.publisher}
        university={params.university}
        purpose={params.purpose}
      />
    </StudentPageShell>
  )
}

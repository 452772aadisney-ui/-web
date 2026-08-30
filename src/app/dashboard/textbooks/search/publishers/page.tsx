import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/app/profile/actions'
import { StudentPageShell } from '@/components/layout/StudentPageShell'
import { TEXTBOOK_PUBLISHERS } from '@/lib/constants/textbook-search'
import {
  fetchTextbookCatalogForStudent,
} from '@/lib/textbooks/catalog-queries'
import { getUniquePublishersFromCatalog } from '@/lib/textbooks/catalog-filter'

export default async function TextbookSearchPublishersPage() {
  const profile = await requireProfile()
  if (profile.role !== 'student') redirect('/dashboard')

  const catalog = await fetchTextbookCatalogForStudent(profile.id)
  const publishers = [
    ...new Set([
      ...TEXTBOOK_PUBLISHERS,
      ...getUniquePublishersFromCatalog(catalog, { publicOnly: true, searchableOnly: true }),
    ]),
  ].sort((a, b) => a.localeCompare(b, 'ja'))

  return (
    <StudentPageShell
      title="出版社から探す"
      backHref="/dashboard/textbooks/search"
      backLabel="検索メニュー"
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {publishers.map((publisher) => (
          <li key={publisher}>
            <Link
              href={`/dashboard/textbooks/search/results?publisher=${encodeURIComponent(publisher)}`}
              className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-sm hover:bg-background"
            >
              {publisher}
              <span aria-hidden>›</span>
            </Link>
          </li>
        ))}
      </ul>
    </StudentPageShell>
  )
}

'use client'

import { TextbookCatalogListItem } from '@/components/textbooks/TextbookCatalogListItem'
import {
  filterTextbookCatalog,
  parseSearchListParam,
} from '@/lib/textbooks/catalog-filter'
import type { TextbookCatalog } from '@/types/textbook'

interface TextbookCatalogSearchResultsProps {
  catalog: TextbookCatalog[]
  registeredCatalogIds: string[]
  studentId: string
  query?: string
  tags?: string | string[]
  publisher?: string
  university?: string
  purpose?: string
  /** When true, catalog is already server-filtered/paginated. */
  alreadyFiltered?: boolean
}

export function TextbookCatalogSearchResults({
  catalog,
  registeredCatalogIds,
  studentId,
  query,
  tags,
  publisher,
  university,
  purpose,
  alreadyFiltered = false,
}: TextbookCatalogSearchResultsProps) {
  const registered = new Set(registeredCatalogIds)

  const results = alreadyFiltered
    ? catalog
    : filterTextbookCatalog(
        catalog,
        {
          query,
          detailTags: parseSearchListParam(tags),
          publisher,
          university,
          studyPurpose: purpose,
        },
        { publicOnly: true },
      )

  if (results.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted">
        条件に合う参考書が見つかりませんでした。キーワードや絞り込みを変えてお試しください。
      </p>
    )
  }

  return (
    <ul className="grid grid-cols-2 gap-3">
      {results.map((item) => (
        <li key={item.id} className="min-w-0">
          <TextbookCatalogListItem
            item={item}
            studentId={studentId}
            isRegistered={registered.has(item.id)}
            layout="grid"
          />
        </li>
      ))}
    </ul>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AdminBookshelfEditModal,
  catalogToEditingItem,
  type AdminEditingCatalog,
} from '@/components/textbooks/AdminBookshelfEditModal'
import { TextbookCoverImage } from '@/components/textbooks/TextbookCoverImage'
import { TextbookPublisherBadge } from '@/components/textbooks/TextbookPublisherBadge'
import {
  filterTextbookCatalog,
  parseSearchListParam,
} from '@/lib/textbooks/catalog-filter'
import type { StudentListGroup } from '@/lib/tags/grade-order'
import type { AdminBookshelfOverview, TextbookCatalog } from '@/types/textbook'

interface AdminTextbookCatalogSearchResultsProps {
  catalog: TextbookCatalog[]
  overview: AdminBookshelfOverview
  studentGroups: StudentListGroup[]
  publishers: string[]
  query?: string
  tags?: string | string[]
  publisher?: string
  university?: string
  purpose?: string
}

function AdminCatalogGridItem({
  item,
  userCount,
  onEdit,
}: {
  item: TextbookCatalog
  userCount: number
  onEdit: () => void
}) {
  const displayTags = item.detail_tags.length > 0 ? item.detail_tags : item.subjects

  return (
    <article className="flex h-full flex-col rounded-xl border border-border bg-card p-3 shadow-sm">
      <TextbookCoverImage
        name={item.name}
        coverUrl={item.cover_url}
        className="mx-auto h-28 w-20"
      />

      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1.5">
          <TextbookPublisherBadge publisher={item.publisher} />
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              item.visibility === 'public'
                ? 'bg-blue-50 text-blue-700'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {item.visibility === 'public' ? '公開' : '非公開'}
          </span>
        </div>

        <h3 className="mt-1 line-clamp-3 text-xs font-bold leading-snug">{item.name}</h3>

        {displayTags.length > 0 && (
          <p className="mt-1 line-clamp-2 text-[10px] text-muted">{displayTags.join('・')}</p>
        )}

        <p className="mt-1 text-[10px] text-muted">利用中: {userCount}人</p>

        <button
          type="button"
          onClick={onEdit}
          className="mt-auto w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-card"
        >
          編集
        </button>
      </div>
    </article>
  )
}

export function AdminTextbookCatalogSearchResults({
  catalog,
  overview,
  studentGroups,
  publishers,
  query,
  tags,
  publisher,
  university,
  purpose,
}: AdminTextbookCatalogSearchResultsProps) {
  const router = useRouter()
  const [editingItem, setEditingItem] = useState<AdminEditingCatalog | null>(null)

  const userCountByCatalogId = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of overview.catalog) {
      counts.set(entry.id, entry.users.length)
    }
    return counts
  }, [overview.catalog])

  const results = useMemo(
    () =>
      filterTextbookCatalog(
        catalog,
        {
          query,
          detailTags: parseSearchListParam(tags),
          publisher,
          university,
          studyPurpose: purpose,
        },
        { publicOnly: false },
      ),
    [catalog, query, tags, publisher, university, purpose],
  )

  function handleCloseModal() {
    setEditingItem(null)
    router.refresh()
  }

  if (results.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted">
        条件に合う参考書が見つかりませんでした。キーワードや絞り込みを変えてお試しください。
      </p>
    )
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {results.map((item) => (
          <li key={item.id} className="min-w-0">
            <AdminCatalogGridItem
              item={item}
              userCount={userCountByCatalogId.get(item.id) ?? 0}
              onEdit={() => setEditingItem(catalogToEditingItem(item, overview))}
            />
          </li>
        ))}
      </ul>

      {editingItem && (
        <AdminBookshelfEditModal
          item={editingItem}
          studentGroups={studentGroups}
          publishers={publishers}
          onClose={handleCloseModal}
        />
      )}
    </>
  )
}

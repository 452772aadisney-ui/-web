'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { TEXTBOOK_DETAIL_TAG_GROUPS } from '@/lib/constants/textbook-detail-tags'
import { cn } from '@/lib/utils'

export function TextbookSubjectTagFilter({
  basePath = '/dashboard/textbooks/search',
}: {
  basePath?: string
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  const selectedList = useMemo(() => [...selected], [selected])

  function toggleTag(tag: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  function toggleGroup(tags: readonly string[]) {
    const selectable = tags.filter((tag) => !tag.startsWith('その他'))
    const allSelected = selectable.every((tag) => selected.has(tag))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const tag of selectable) {
        if (allSelected) next.delete(tag)
        else next.add(tag)
      }
      return next
    })
  }

  function handleSearch() {
    if (selectedList.length === 0) return
    const params = new URLSearchParams()
    params.set('tags', selectedList.join(','))
    router.push(`${basePath}/results?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">教科・科目は複数選択できます</p>

      {TEXTBOOK_DETAIL_TAG_GROUPS.map((group) => {
        const selectable = group.tags.filter((tag) => !tag.startsWith('その他'))
        const allSelected =
          selectable.length > 0 && selectable.every((tag) => selected.has(tag))

        return (
          <section
            key={group.label}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-bold">{group.label}</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toggleGroup(group.tags)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                  allSelected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-foreground',
                )}
              >
                ✓ すべて選択
              </button>

              {group.tags.map((tag) => {
                const isSelected = selected.has(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                      isSelected
                        ? 'border-primary bg-primary text-white'
                        : 'border-primary/30 bg-background text-primary',
                    )}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      <div className="sticky bottom-4 flex gap-3">
        <button
          type="button"
          onClick={handleSearch}
          disabled={selectedList.length === 0}
          className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          この条件で検索 ({selectedList.length})
        </button>
        <Link
          href={basePath}
          className="rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium"
        >
          戻る
        </Link>
      </div>
    </div>
  )
}

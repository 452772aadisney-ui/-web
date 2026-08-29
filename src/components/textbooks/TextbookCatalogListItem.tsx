'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { addTextbookFromCatalog } from '@/app/textbooks/actions'
import { TextbookCoverImage } from '@/components/textbooks/TextbookCoverImage'
import type { TextbookCatalog } from '@/types/textbook'

interface TextbookCatalogListItemProps {
  item: TextbookCatalog
  studentId: string
  isRegistered: boolean
  showRegisterButton?: boolean
  layout?: 'row' | 'grid'
}

export function TextbookCatalogListItem({
  item,
  studentId,
  isRegistered,
  showRegisterButton = true,
  layout = 'row',
}: TextbookCatalogListItemProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const displayTags = item.detail_tags.length > 0 ? item.detail_tags : item.subjects

  async function handleRegister() {
    if (pending || isRegistered) return
    setPending(true)
    setError(null)

    const formData = new FormData()
    formData.set('catalogId', item.id)

    const result = await addTextbookFromCatalog(studentId, {}, formData)
    setPending(false)

    if (result.error) {
      setError(result.error)
      return
    }

    router.push('/dashboard/bookshelf')
    router.refresh()
  }

  const registerControl = showRegisterButton ? (
    isRegistered ? (
      <span className="text-xs font-medium text-green-700">登録済み</span>
    ) : (
      <button
        type="button"
        onClick={handleRegister}
        disabled={pending}
        className={
          layout === 'grid'
            ? 'w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60'
            : 'rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60'
        }
      >
        {pending ? '登録中…' : '本棚に追加'}
      </button>
    )
  ) : null

  if (layout === 'grid') {
    return (
      <article className="flex h-full flex-col rounded-xl border border-border bg-card p-3 shadow-sm">
        <TextbookCoverImage
          name={item.name}
          coverUrl={item.cover_url}
          className="mx-auto h-28 w-20"
        />

        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          {item.publisher && (
            <span className="inline-block w-fit rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted">
              {item.publisher}
            </span>
          )}
          <h3 className="mt-1 line-clamp-3 text-xs font-bold leading-snug">{item.name}</h3>

          {displayTags.length > 0 && (
            <p className="mt-1 line-clamp-2 text-[10px] text-muted">{displayTags.join('・')}</p>
          )}

          {error && <p className="mt-2 text-[10px] text-error">{error}</p>}

          {registerControl && <div className="mt-auto pt-3">{registerControl}</div>}
        </div>
      </article>
    )
  }

  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex gap-3">
        <TextbookCoverImage
          name={item.name}
          coverUrl={item.cover_url}
          className="h-24 w-16"
        />

        <div className="min-w-0 flex-1">
          {item.publisher && (
            <span className="inline-block rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted">
              {item.publisher}
            </span>
          )}
          <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug">{item.name}</h3>

          {displayTags.length > 0 && (
            <p className="mt-1 line-clamp-2 text-[11px] text-muted">{displayTags.join('・')}</p>
          )}

          {item.study_purposes.length > 0 && (
            <p className="mt-2 text-[11px] text-muted">{item.study_purposes.join(' / ')}</p>
          )}

          {error && <p className="mt-2 text-xs text-error">{error}</p>}

          {registerControl && <div className="mt-2">{registerControl}</div>}
        </div>
      </div>
    </article>
  )
}

export function TextbookBookshelfListItem({
  name,
  coverUrl,
  publisher,
  detailTags,
  subjects,
  usageTags,
  periodLabel,
  isNew,
  actions,
  layout = 'row',
}: {
  name: string
  coverUrl?: string | null
  publisher?: string | null
  detailTags?: string[]
  subjects: string[]
  usageTags: string[]
  periodLabel: string
  isNew?: boolean
  actions?: React.ReactNode
  layout?: 'row' | 'grid'
}) {
  const displayTags = (detailTags && detailTags.length > 0 ? detailTags : subjects).join('・')

  if (layout === 'grid') {
    return (
      <article className="flex h-full flex-col rounded-xl border border-border bg-card p-3 shadow-sm">
        <TextbookCoverImage name={name} coverUrl={coverUrl} className="mx-auto h-28 w-20" />
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          {publisher && (
            <span className="inline-block w-fit rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted">
              {publisher}
            </span>
          )}
          <h3 className="mt-1 line-clamp-3 text-xs font-bold leading-snug">{name}</h3>
          <p className="mt-1 line-clamp-2 text-[10px] text-muted">
            {displayTags}
            {usageTags.length > 0 ? ` / ${usageTags.join('・')}` : ''}
          </p>
          <p className="mt-1 text-[10px] text-muted">期間: {periodLabel}</p>
          {isNew && (
            <span className="mt-2 inline-block w-fit rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
              新規
            </span>
          )}
          {actions && <div className="mt-auto flex gap-3 pt-3">{actions}</div>}
        </div>
      </article>
    )
  }

  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex gap-3">
        <TextbookCoverImage name={name} coverUrl={coverUrl} className="h-24 w-16" />
        <div className="min-w-0 flex-1">
          {publisher && (
            <span className="inline-block rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted">
              {publisher}
            </span>
          )}
          <h3 className="mt-1 text-sm font-bold leading-snug">{name}</h3>
          <p className="mt-1 text-[11px] text-muted">
            {displayTags}
            {usageTags.length > 0 ? ` / ${usageTags.join('・')}` : ''}
          </p>
          <p className="mt-1 text-[11px] text-muted">期間: {periodLabel}</p>
          {isNew && (
            <span className="mt-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
              新規
            </span>
          )}
          {actions && <div className="mt-2 flex gap-3">{actions}</div>}
        </div>
      </div>
    </article>
  )
}

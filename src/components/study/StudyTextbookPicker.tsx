'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  getStudySubjectCategoriesForProfile,
  type TextbookSubjectCategoryLabel,
} from '@/lib/constants/textbook-subject-categories'
import type { StudyTextbookPickerItem } from '@/lib/study/textbook-picker'
import { cn } from '@/lib/utils'

function formatLastStudiedOn(dateKey: string | null): string | null {
  if (!dateKey) return null
  const [, month, day] = dateKey.split('-')
  if (!month || !day) return dateKey
  return `最終記録: ${Number(month)}/${Number(day)}`
}

function TextbookPickCard({
  book,
  href,
}: {
  book: StudyTextbookPickerItem
  href: string
}) {
  const detailTags = book.detail_tags ?? []
  const usageTags = book.usage_tags ?? []
  const subjects = book.subjects ?? []
  const tags = [...(detailTags.length > 0 ? detailTags : subjects), ...usageTags]
    .filter(Boolean)
    .slice(0, 4)

  return (
    <article className="flex flex-col rounded-xl border border-border bg-background p-4 shadow-sm">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold leading-snug">{book.name}</h3>
        <p className="mt-1 text-xs text-muted">
          {book.subjectLabel ?? '科目未設定'}
          {tags.length > 0 ? ` / ${tags.join('・')}` : ''}
        </p>
        {book.lastStudiedOn && (
          <p className="mt-1 text-xs text-muted">{formatLastStudiedOn(book.lastStudiedOn)}</p>
        )}
      </div>
      <Link
        href={href}
        className="mt-3 inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        勉強を記録
      </Link>
    </article>
  )
}

interface StudyTextbookPickerProps {
  profileSubjects: string[]
  textbooks: StudyTextbookPickerItem[]
  recentTextbooks: StudyTextbookPickerItem[]
}

export function StudyTextbookPicker({
  profileSubjects,
  textbooks,
  recentTextbooks,
}: StudyTextbookPickerProps) {
  const categories = getStudySubjectCategoriesForProfile(profileSubjects)
  const [selectedCategory, setSelectedCategory] = useState<TextbookSubjectCategoryLabel | 'all'>(
    categories[0] ?? 'all',
  )
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return textbooks.filter((book) => {
      if (selectedCategory !== 'all' && book.subjectLabel !== selectedCategory) {
        return false
      }
      if (!normalized) return true
      return book.name.toLowerCase().includes(normalized)
    })
  }, [textbooks, selectedCategory, query])

  if (textbooks.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-900">
        <p className="font-medium">登録済みの参考書がありません。</p>
        <p className="mt-1">教材を登録すると、ここから直接学習記録ができます。</p>
        <Link
          href="/dashboard/textbooks/register"
          className="mt-3 inline-flex font-medium text-primary underline"
        >
          教材登録へ進む →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {recentTextbooks.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-muted">最近使った参考書</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {recentTextbooks.map((book) => (
              <TextbookPickCard
                key={`recent-${book.id}`}
                book={book}
                href={`/dashboard/study/textbook?textbookId=${encodeURIComponent(book.id)}`}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-bold text-muted">登録済み参考書</h3>
          <label className="block w-full sm:max-w-xs">
            <span className="sr-only">参考書名で検索</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="参考書名で検索"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="科目で絞り込み">
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === 'all'}
              onClick={() => setSelectedCategory('all')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                selectedCategory === 'all'
                  ? 'bg-primary text-white'
                  : 'border border-border bg-background hover:bg-card',
              )}
            >
              すべて
            </button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={selectedCategory === category}
                onClick={() => setSelectedCategory(category)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                  selectedCategory === category
                    ? 'bg-primary text-white'
                    : 'border border-border bg-background hover:bg-card',
                )}
              >
                {category}
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted">
            <p>該当する参考書がありません。</p>
            <Link
              href="/dashboard/textbooks/register"
              className="mt-2 inline-flex font-medium text-primary hover:underline"
            >
              教材を登録する →
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((book) => (
              <TextbookPickCard
                key={book.id}
                book={book}
                href={`/dashboard/study/textbook?textbookId=${encodeURIComponent(book.id)}`}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

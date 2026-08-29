'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useMemo, useState } from 'react'
import { TEXTBOOK_STUDY_PURPOSES } from '@/lib/constants/textbook-search'

export const TEXTBOOK_SEARCH_ICONS = {
  search: '/icons/textbook-search/search.png',
  subject: '/icons/textbook-search/subject.png',
  university: '/icons/textbook-search/university.png',
  publisher: '/icons/textbook-search/publisher.png',
  studentRegistered: '/icons/mypage/textbook-register.png',
} as const

const listLinkClass =
  'flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-sm transition hover:bg-background'

const tileLinkClass =
  'flex min-h-[4.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card px-2 py-4 text-center text-sm font-medium shadow-sm transition hover:bg-background sm:flex-row sm:gap-2 sm:px-3'

function SearchMenuIcon({ src, className }: { src: string; className?: string }) {
  return (
    <Image
      src={src}
      alt=""
      width={32}
      height={32}
      className={className ?? 'h-8 w-8 shrink-0'}
      aria-hidden
    />
  )
}

export function TextbookSearchMenu({
  basePath = '/dashboard/textbooks/search',
  createHref = '/dashboard/textbooks/register?mode=create',
  createLinkLabel = '自分で登録',
  includeStudentRegistered = false,
}: {
  basePath?: string
  createHref?: string
  createLinkLabel?: string
  includeStudentRegistered?: boolean
} = {}) {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const categoryTiles = useMemo(() => {
    const tiles: Array<{ href: string; label: string; iconSrc: string }> = [
      {
        href: `${basePath}/subjects`,
        label: '教科',
        iconSrc: TEXTBOOK_SEARCH_ICONS.subject,
      },
      {
        href: `${basePath}/universities`,
        label: '大学別',
        iconSrc: TEXTBOOK_SEARCH_ICONS.university,
      },
      {
        href: `${basePath}/publishers`,
        label: '出版社',
        iconSrc: TEXTBOOK_SEARCH_ICONS.publisher,
      },
    ]

    if (includeStudentRegistered) {
      tiles.push({
        href: `${basePath}/student-entries`,
        label: '生徒登録教材',
        iconSrc: TEXTBOOK_SEARCH_ICONS.studentRegistered,
      })
    }

    return tiles
  }, [basePath, includeStudentRegistered])

  const purposeLinks = useMemo(
    () =>
      TEXTBOOK_STUDY_PURPOSES.map((purpose) => ({
        href: `${basePath}/results?purpose=${encodeURIComponent(purpose)}`,
        label: purpose,
      })),
    [basePath],
  )

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) {
      router.push(`${basePath}/results`)
      return
    }
    router.push(`${basePath}/results?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="参考書名やキーワードで検索"
          className="w-full rounded-xl border border-border bg-card py-3 pl-4 pr-20 text-sm shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white"
        >
          検索
        </button>
      </form>

      <section className="space-y-2">
        <p className="text-xs font-medium text-muted">参考書から探す</p>
        <Link href={`${basePath}/results`} className={listLinkClass}>
          <SearchMenuIcon src={TEXTBOOK_SEARCH_ICONS.search} />
          <span className="min-w-0 flex-1">
            <span className="block font-bold">すべての参考書を検索</span>
            <span className="mt-0.5 block text-xs font-normal text-muted">
              登録されているすべての本から探す
            </span>
          </span>
          <span className="shrink-0 text-muted" aria-hidden>
            ›
          </span>
        </Link>
      </section>

      <section
        className={
          includeStudentRegistered
            ? 'grid grid-cols-2 gap-3 sm:grid-cols-4'
            : 'grid grid-cols-3 gap-3'
        }
      >
        {categoryTiles.map((tile) => (
          <Link key={tile.href} href={tile.href} className={tileLinkClass}>
            <SearchMenuIcon src={tile.iconSrc} className="h-8 w-8 shrink-0" />
            <span>{tile.label}</span>
          </Link>
        ))}
      </section>

      <section className="space-y-2">
        <p className="text-xs font-medium text-muted">使用目的から探す</p>
        {purposeLinks.map((link) => (
          <Link key={link.href} href={link.href} className={`${listLinkClass} justify-between`}>
            {link.label}
            <span className="text-muted" aria-hidden>
              ›
            </span>
          </Link>
        ))}
      </section>

      <p className="text-center text-sm text-muted">
        リストにない本は{' '}
        <Link href={createHref} className="text-primary hover:underline">
          {createLinkLabel}
        </Link>
        から追加できます。
      </p>
    </div>
  )
}

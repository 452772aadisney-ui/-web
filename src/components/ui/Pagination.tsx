'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  DEFAULT_PAGE_SIZE,
  getTotalPages,
} from '@/lib/pagination'

export { DEFAULT_PAGE_SIZE, getTotalPages, parsePageParam } from '@/lib/pagination'

function buildPageHref(
  pathname: string,
  page: number,
  pageParam: string,
  preserveParams?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams()

  if (preserveParams) {
    for (const [key, value] of Object.entries(preserveParams)) {
      if (!value || key === pageParam) continue
      params.set(key, value)
    }
  }

  if (page > 1) {
    params.set(pageParam, String(page))
  }

  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

function getVisiblePages(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages = new Set<number>([1, totalPages, currentPage])

  for (let offset = -1; offset <= 1; offset += 1) {
    const page = currentPage + offset
    if (page >= 1 && page <= totalPages) pages.add(page)
  }

  return [...pages].sort((a, b) => a - b)
}

interface PaginationProps {
  currentPage: number
  totalCount: number
  pageSize?: number
  pageParam?: string
  pathname: string
  preserveParams?: Record<string, string | undefined>
  className?: string
}

export function Pagination({
  currentPage,
  totalCount,
  pageSize = DEFAULT_PAGE_SIZE,
  pageParam = 'page',
  pathname,
  preserveParams,
  className,
}: PaginationProps) {
  const totalPages = getTotalPages(totalCount, pageSize)

  if (totalPages <= 1) return null

  const prevPage = currentPage > 1 ? currentPage - 1 : null
  const nextPage = currentPage < totalPages ? currentPage + 1 : null
  const visiblePages = getVisiblePages(currentPage, totalPages)

  const linkClass =
    'inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
  const activeClass = 'border-primary bg-blue-50 text-primary'
  const disabledClass = 'cursor-not-allowed opacity-40 pointer-events-none'

  return (
    <nav
      className={cn('mt-6 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2', className)}
      aria-label="ページネーション"
    >
      {prevPage ? (
        <Link
          href={buildPageHref(pathname, prevPage, pageParam, preserveParams)}
          className={cn(linkClass, 'px-3')}
          scroll={false}
        >
          前へ
        </Link>
      ) : (
        <span className={cn(linkClass, 'px-3', disabledClass)} aria-disabled="true">
          前へ
        </span>
      )}

      <div className="flex flex-wrap items-center justify-center gap-1">
        {visiblePages.map((page, index) => {
          const prev = visiblePages[index - 1]
          const showEllipsis = prev !== undefined && page - prev > 1

          return (
            <span key={page} className="flex items-center gap-1">
              {showEllipsis && <span className="px-1 text-sm text-muted">…</span>}
              {page === currentPage ? (
                <span className={cn(linkClass, activeClass)} aria-current="page">
                  {page}
                </span>
              ) : (
                <Link
                  href={buildPageHref(pathname, page, pageParam, preserveParams)}
                  className={linkClass}
                  scroll={false}
                >
                  {page}
                </Link>
              )}
            </span>
          )
        })}
      </div>

      {nextPage ? (
        <Link
          href={buildPageHref(pathname, nextPage, pageParam, preserveParams)}
          className={cn(linkClass, 'px-3')}
          scroll={false}
        >
          次へ
        </Link>
      ) : (
        <span className={cn(linkClass, 'px-3', disabledClass)} aria-disabled="true">
          次へ
        </span>
      )}

      <p className="w-full text-center text-xs text-muted sm:w-auto sm:pl-2">
        {currentPage} / {totalPages} ページ（全 {totalCount} 件）
      </p>
    </nav>
  )
}

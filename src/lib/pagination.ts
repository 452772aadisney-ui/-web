export const DEFAULT_PAGE_SIZE = 10

export function parsePageParam(
  value: string | undefined,
  totalPages: number,
): number {
  const parsed = parseInt(value ?? '1', 10)
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
  if (totalPages <= 0) return 1
  return Math.min(page, totalPages)
}

export function getTotalPages(totalCount: number, pageSize: number): number {
  if (totalCount <= 0) return 0
  return Math.ceil(totalCount / pageSize)
}

/** 1-based inclusive item range for the current page, or null when empty. */
export function getPageItemRange(
  page: number,
  pageSize: number,
  totalCount: number,
): { from: number; to: number } | null {
  if (totalCount <= 0 || pageSize <= 0) return null
  const safePage = Math.max(1, page)
  const from = (safePage - 1) * pageSize + 1
  if (from > totalCount) return null
  const to = Math.min(safePage * pageSize, totalCount)
  return { from, to }
}

/** Display copy: `21～40件を表示` (null when empty / out of range). */
export function formatPageItemRangeLabel(
  page: number,
  pageSize: number,
  totalCount: number,
): string | null {
  const range = getPageItemRange(page, pageSize, totalCount)
  if (!range) return null
  return `${range.from}～${range.to}件を表示`
}

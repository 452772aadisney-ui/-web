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

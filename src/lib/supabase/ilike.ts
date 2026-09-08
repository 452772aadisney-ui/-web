/**
 * Sanitize user text for PostgREST `ilike` patterns.
 * Strips LIKE wildcards and filter-list separators so values are never
 * concatenated as raw query syntax.
 */
export function sanitizeIlikePattern(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const cleaned = trimmed.replace(/[%_,.()\\]/g, '')
  if (!cleaned) return null
  return `%${cleaned}%`
}

import { getJstDateKey, isValidDateKey } from '@/lib/study/dates'

/**
 * Default session date for a new karte entry.
 * Prefer an already-saved/draft YYYY-MM-DD; otherwise use JST today (not server local/UTC).
 */
export function resolveNewKarteSessionDate(options?: {
  savedOrDraftDate?: string | null
  now?: Date
}): string {
  const saved = options?.savedOrDraftDate?.trim()
  if (saved && isValidDateKey(saved)) return saved
  return getJstDateKey(options?.now)
}

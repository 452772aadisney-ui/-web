import { isValidDateKey, shiftDateKey } from '@/lib/study/dates'
import type { StudyDayFeedback } from '@/lib/study/feedback'

/** Same meaning as the 毎日管理 incomplete badge: no day-level feedback row. */
export function isStudyDayFeedbackIncomplete(
  feedback: StudyDayFeedback | null | undefined,
): boolean {
  return feedback == null
}

export function pendingStudyDayKey(studentId: string, studiedOn: string): string {
  return `${studentId}:${studiedOn}`
}

export type PendingStudyDayPair = {
  studentId: string
  studiedOn: string
}

export type PendingDateFilter =
  | { mode: 'beforeToday'; beforeExclusive: string }
  | { mode: 'exact'; date: string }

/**
 * Default: JST yesterday-and-earlier (`studied_on < today`).
 * With a valid `date` query: that calendar day only (today allowed).
 */
export function resolvePendingDateFilter(params: {
  todayKey: string
  date?: string | null
}): PendingDateFilter {
  const raw = params.date?.trim() ?? ''
  if (isValidDateKey(raw)) {
    return { mode: 'exact', date: raw }
  }
  return { mode: 'beforeToday', beforeExclusive: params.todayKey }
}

export function defaultPendingListDateLabel(todayKey: string): string {
  return `${shiftDateKey(todayKey, -1)} 以前`
}

export function buildPendingStudyDayPairs(
  logPairs: ReadonlyArray<{ studentId: string; studiedOn: string }>,
  feedbackKeys: ReadonlySet<string>,
): PendingStudyDayPair[] {
  const seen = new Set<string>()
  const pending: PendingStudyDayPair[] = []

  for (const pair of logPairs) {
    const key = pendingStudyDayKey(pair.studentId, pair.studiedOn)
    if (seen.has(key)) continue
    seen.add(key)
    if (!feedbackKeys.has(key)) {
      pending.push({ studentId: pair.studentId, studiedOn: pair.studiedOn })
    }
  }

  return pending
}

/** Older studied_on first; same day uses existing ja name order. */
export function comparePendingStudyDayOrder(
  a: { studiedOn: string; studentId: string },
  b: { studiedOn: string; studentId: string },
  nameByStudentId: ReadonlyMap<string, string>,
): number {
  if (a.studiedOn !== b.studiedOn) {
    return a.studiedOn < b.studiedOn ? -1 : 1
  }
  const nameA = nameByStudentId.get(a.studentId) ?? ''
  const nameB = nameByStudentId.get(b.studentId) ?? ''
  return nameA.localeCompare(nameB, 'ja')
}

export function sortPendingStudyDayPairs(
  pairs: ReadonlyArray<PendingStudyDayPair>,
  nameByStudentId: ReadonlyMap<string, string>,
): PendingStudyDayPair[] {
  return [...pairs].sort((a, b) =>
    comparePendingStudyDayOrder(a, b, nameByStudentId),
  )
}

export function matchesPendingStudentName(
  name: string,
  query: string,
): boolean {
  const q = query.trim().toLocaleLowerCase('ja-JP')
  if (!q) return true
  return name.toLocaleLowerCase('ja-JP').includes(q)
}

export function paginatePendingPairs<T>(
  items: ReadonlyArray<T>,
  page: number,
  pageSize: number,
): { pageItems: T[]; totalCount: number; page: number } {
  const totalCount = items.length
  const totalPages = totalCount <= 0 ? 0 : Math.ceil(totalCount / pageSize)
  const safePage =
    totalPages <= 0
      ? 1
      : Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    pageItems: items.slice(start, start + pageSize) as T[],
    totalCount,
    page: safePage,
  }
}

/**
 * Optimistic concurrency for day feedback upsert (no schema change).
 * - Client thought the day was incomplete (`expectedFeedbackId` empty) but a row
 *   already exists → another admin likely replied first; refuse silent overwrite.
 * - Client is updating a known row but the stored comment no longer matches the
 *   snapshot loaded into the form → refuse overwriting that comment blindly.
 */
export function detectStudyDayFeedbackWriteConflict(params: {
  existing: { id: string; comment: string } | null
  expectedFeedbackId: string
  expectedComment: string
}): { conflict: false } | { conflict: true; error: string } {
  const expectedId = params.expectedFeedbackId.trim()
  const existing = params.existing

  if (!existing) {
    return { conflict: false }
  }

  if (!expectedId) {
    return {
      conflict: true,
      error:
        '別の管理者が先に対応済みです。画面を更新して内容を確認してください。',
    }
  }

  if (existing.id !== expectedId) {
    return {
      conflict: true,
      error:
        '別の管理者が先に対応済みです。画面を更新して内容を確認してください。',
    }
  }

  if (String(existing.comment).trim() !== params.expectedComment.trim()) {
    return {
      conflict: true,
      error:
        '他の管理者によりコメントが更新されています。画面を更新してから再度保存してください。',
    }
  }

  return { conflict: false }
}

/** Retained cards must match the active date/name filter after condition changes. */
export function retainedItemMatchesPendingFilter(
  item: { studiedOn: string; studentName: string },
  filter: {
    dateFilter: PendingDateFilter
    query: string
  },
): boolean {
  if (filter.dateFilter.mode === 'exact') {
    if (item.studiedOn !== filter.dateFilter.date) return false
  } else if (!(item.studiedOn < filter.dateFilter.beforeExclusive)) {
    return false
  }
  return matchesPendingStudentName(item.studentName, filter.query)
}

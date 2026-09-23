import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { StudyLog } from '@/lib/study/chart-data'
import { getPersonName } from '@/lib/auth/display-name'
import type { StudyDayFeedback } from '@/lib/study/feedback'
import {
  hasReadableStudyFeedbackComment,
  isStudyFeedbackUnread,
  normalizeFeedbackCommentForRead,
} from '@/lib/study/feedback-unread'
import { getTotalPages, parsePageParam, DEFAULT_PAGE_SIZE } from '@/lib/pagination'
import {
  buildPendingStudyDayPairs,
  isStudyDayFeedbackIncomplete,
  matchesPendingStudentName,
  paginatePendingPairs,
  pendingStudyDayKey,
  resolvePendingDateFilter,
  sortPendingStudyDayPairs,
} from '@/lib/study/pending-feedback'

export type StudentDailyStudySummary = {
  student: {
    id: string
    full_name: string
    display_name: string
    email: string
    student_code: string | null
  }
  logs: StudyLog[]
  totalMinutes: number
  feedback: StudyDayFeedback | null
}

export type StudyFeedbackCommentListItem = {
  feedbackId: string
  studiedOn: string
  comment: string
  stamp: StudyDayFeedback['stamp']
  updatedAt: string
  isUnread: boolean
  /** Distinct subjects from that day's study logs (may be empty). */
  subjects: string[]
  /** Distinct textbook names from that day's study logs (may be empty). */
  textbookNames: string[]
}

export type StudyFeedbackCommentFilter = 'unread' | 'all'

export type StudyFeedbackCommentPage = {
  items: StudyFeedbackCommentListItem[]
  totalCount: number
  page: number
  pageSize: number
  filter: StudyFeedbackCommentFilter
  unreadCount: number
}

export async function fetchStudyDayFeedback(
  studentId: string,
  studiedOn: string,
): Promise<StudyDayFeedback | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('study_day_feedback')
    .select('*')
    .eq('student_id', studentId)
    .eq('studied_on', studiedOn)
    .maybeSingle()

  return (data as StudyDayFeedback | null) ?? null
}

export async function fetchStudyDayFeedbackForDate(
  studiedOn: string,
): Promise<StudyDayFeedback[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('study_day_feedback')
    .select('*')
    .eq('studied_on', studiedOn)

  return (data as StudyDayFeedback[]) ?? []
}

export async function fetchStudentDailyStudySummaries(
  studiedOn: string,
): Promise<StudentDailyStudySummary[]> {
  const supabase = await createClient()

  const [{ data: logs, error: logsError }, { data: feedbackRows, error: feedbackError }] =
    await Promise.all([
      supabase
        .from('study_logs')
        .select('*')
        .eq('studied_on', studiedOn)
        .order('created_at', { ascending: true }),
      supabase.from('study_day_feedback').select('*').eq('studied_on', studiedOn),
    ])

  if (logsError || feedbackError || !logs?.length) {
    return []
  }

  const studentIds = [...new Set(logs.map((log) => log.student_id as string))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, display_name, email, student_code')
    .in('id', studentIds)
    .eq('role', 'student')

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]))
  const feedbackByStudentId = new Map(
    ((feedbackRows ?? []) as StudyDayFeedback[]).map((feedback) => [
      feedback.student_id,
      feedback,
    ]),
  )

  const logsByStudent = new Map<string, StudyLog[]>()
  for (const log of logs as StudyLog[]) {
    const list = logsByStudent.get(log.student_id) ?? []
    list.push(log)
    logsByStudent.set(log.student_id, list)
  }

  const summaries: StudentDailyStudySummary[] = []

  for (const studentId of studentIds) {
    const student = profileById.get(studentId)
    if (!student) continue

    const studentLogs = logsByStudent.get(studentId) ?? []
    summaries.push({
      student: student as StudentDailyStudySummary['student'],
      logs: studentLogs,
      totalMinutes: studentLogs.reduce((sum, log) => sum + log.duration_minutes, 0),
      feedback: feedbackByStudentId.get(studentId) ?? null,
    })
  }

  summaries.sort((a, b) =>
    getPersonName(a.student).localeCompare(getPersonName(b.student), 'ja'),
  )

  return summaries
}

export type PendingStudyFeedbackItem = StudentDailyStudySummary & {
  studiedOn: string
}

export async function fetchIncompleteStudyFeedbackCount(
  studiedOn: string,
): Promise<number> {
  const summaries = await fetchStudentDailyStudySummaries(studiedOn)
  return summaries.filter((summary) =>
    isStudyDayFeedbackIncomplete(summary.feedback),
  ).length
}

const PENDING_PAIR_PAGE_SIZE = 1000

async function fetchAllStudyLogPairsForPendingFilter(
  dateFilter: ReturnType<typeof resolvePendingDateFilter>,
): Promise<Array<{ studentId: string; studiedOn: string }>> {
  const supabase = await createClient()
  const pairs: Array<{ studentId: string; studiedOn: string }> = []
  let from = 0

  for (;;) {
    let query = supabase.from('study_logs').select('student_id, studied_on')
    if (dateFilter.mode === 'exact') {
      query = query.eq('studied_on', dateFilter.date)
    } else {
      query = query.lt('studied_on', dateFilter.beforeExclusive)
    }

    const { data, error } = await query.range(from, from + PENDING_PAIR_PAGE_SIZE - 1)
    if (error || !data?.length) break

    for (const row of data) {
      pairs.push({
        studentId: String(row.student_id),
        studiedOn: String(row.studied_on),
      })
    }

    if (data.length < PENDING_PAIR_PAGE_SIZE) break
    from += PENDING_PAIR_PAGE_SIZE
  }

  return pairs
}

async function fetchFeedbackKeysForPendingFilter(
  dateFilter: ReturnType<typeof resolvePendingDateFilter>,
): Promise<Set<string>> {
  const supabase = await createClient()
  const keys = new Set<string>()
  let from = 0

  for (;;) {
    let query = supabase
      .from('study_day_feedback')
      .select('student_id, studied_on')
    if (dateFilter.mode === 'exact') {
      query = query.eq('studied_on', dateFilter.date)
    } else {
      query = query.lt('studied_on', dateFilter.beforeExclusive)
    }

    const { data, error } = await query.range(from, from + PENDING_PAIR_PAGE_SIZE - 1)
    if (error || !data?.length) break

    for (const row of data) {
      keys.add(pendingStudyDayKey(String(row.student_id), String(row.studied_on)))
    }

    if (data.length < PENDING_PAIR_PAGE_SIZE) break
    from += PENDING_PAIR_PAGE_SIZE
  }

  return keys
}

async function hydratePendingStudyFeedbackItems(
  pairs: Array<{ studentId: string; studiedOn: string }>,
  profileById: Map<string, StudentDailyStudySummary['student']>,
): Promise<PendingStudyFeedbackItem[]> {
  if (pairs.length === 0) return []

  const supabase = await createClient()
  const studentIds = [...new Set(pairs.map((p) => p.studentId))]
  const studiedOns = [...new Set(pairs.map((p) => p.studiedOn))]
  const pairKeySet = new Set(
    pairs.map((p) => pendingStudyDayKey(p.studentId, p.studiedOn)),
  )

  const [{ data: logs }, { data: feedbackRows }] = await Promise.all([
    supabase
      .from('study_logs')
      .select('*')
      .in('student_id', studentIds)
      .in('studied_on', studiedOns)
      .order('created_at', { ascending: true }),
    supabase
      .from('study_day_feedback')
      .select('*')
      .in('student_id', studentIds)
      .in('studied_on', studiedOns),
  ])

  const logsByKey = new Map<string, StudyLog[]>()
  for (const log of (logs ?? []) as StudyLog[]) {
    const key = pendingStudyDayKey(log.student_id, log.studied_on)
    if (!pairKeySet.has(key)) continue
    const list = logsByKey.get(key) ?? []
    list.push(log)
    logsByKey.set(key, list)
  }

  const feedbackByKey = new Map(
    ((feedbackRows ?? []) as StudyDayFeedback[]).map((feedback) => [
      pendingStudyDayKey(feedback.student_id, feedback.studied_on),
      feedback,
    ]),
  )

  const items: PendingStudyFeedbackItem[] = []
  for (const pair of pairs) {
    const student = profileById.get(pair.studentId)
    if (!student) continue
    const key = pendingStudyDayKey(pair.studentId, pair.studiedOn)
    const studentLogs = logsByKey.get(key) ?? []
    if (studentLogs.length === 0) continue

    items.push({
      student,
      logs: studentLogs,
      totalMinutes: studentLogs.reduce((sum, log) => sum + log.duration_minutes, 0),
      feedback: feedbackByKey.get(key) ?? null,
      studiedOn: pair.studiedOn,
    })
  }

  return items
}

export type PendingStudyFeedbackPage = {
  items: PendingStudyFeedbackItem[]
  totalCount: number
  page: number
  pageSize: number
  dateFilter: ReturnType<typeof resolvePendingDateFilter>
  query: string
}

/**
 * Pending = day-level stamp missing (same as 毎日管理 incomplete badge),
 * scoped by date filter + optional student name query. Pages by student×day.
 */
export async function fetchPendingStudyFeedbackPage(params: {
  todayKey: string
  date?: string | null
  query?: string | null
  page?: number
  pageSize?: number
}): Promise<PendingStudyFeedbackPage> {
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const query = params.query?.trim() ?? ''
  const dateFilter = resolvePendingDateFilter({
    todayKey: params.todayKey,
    date: params.date,
  })

  const empty: PendingStudyFeedbackPage = {
    items: [],
    totalCount: 0,
    page: 1,
    pageSize,
    dateFilter,
    query,
  }

  if (dateFilter.mode === 'exact') {
    const summaries = await fetchStudentDailyStudySummaries(dateFilter.date)
    const pendingSummaries = summaries.filter((summary) =>
      isStudyDayFeedbackIncomplete(summary.feedback),
    )
    const filtered = query
      ? pendingSummaries.filter((summary) =>
          matchesPendingStudentName(getPersonName(summary.student), query),
        )
      : pendingSummaries

    const requestedPage = params.page ?? 1
    const { pageItems, totalCount, page } = paginatePendingPairs(
      filtered,
      requestedPage,
      pageSize,
    )

    return {
      items: pageItems.map((summary) => ({
        ...summary,
        studiedOn: dateFilter.date,
      })),
      totalCount,
      page,
      pageSize,
      dateFilter,
      query,
    }
  }

  const [logPairs, feedbackKeys] = await Promise.all([
    fetchAllStudyLogPairsForPendingFilter(dateFilter),
    fetchFeedbackKeysForPendingFilter(dateFilter),
  ])

  if (logPairs.length === 0) return empty

  let pendingPairs = buildPendingStudyDayPairs(logPairs, feedbackKeys)
  if (pendingPairs.length === 0) return empty

  const studentIds = [...new Set(pendingPairs.map((p) => p.studentId))]
  const supabase = await createClient()
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, display_name, email, student_code')
    .in('id', studentIds)
    .eq('role', 'student')

  const profileById = new Map(
    (profiles ?? []).map((profile) => [
      profile.id as string,
      profile as StudentDailyStudySummary['student'],
    ]),
  )

  const nameByStudentId = new Map<string, string>()
  for (const [id, profile] of profileById) {
    nameByStudentId.set(id, getPersonName(profile))
  }

  pendingPairs = pendingPairs.filter((pair) => profileById.has(pair.studentId))
  if (query) {
    pendingPairs = pendingPairs.filter((pair) =>
      matchesPendingStudentName(nameByStudentId.get(pair.studentId) ?? '', query),
    )
  }

  const sorted = sortPendingStudyDayPairs(pendingPairs, nameByStudentId)
  const requestedPage = params.page ?? 1
  const { pageItems, totalCount, page } = paginatePendingPairs(
    sorted,
    requestedPage,
    pageSize,
  )

  const items = await hydratePendingStudyFeedbackItems(pageItems, profileById)

  // Preserve sorted page order after hydration (skip dropped empty pairs).
  const itemByKey = new Map(
    items.map((item) => [pendingStudyDayKey(item.student.id, item.studiedOn), item]),
  )
  const orderedItems = pageItems
    .map((pair) => itemByKey.get(pendingStudyDayKey(pair.studentId, pair.studiedOn)))
    .filter((item): item is PendingStudyFeedbackItem => Boolean(item))

  return {
    items: orderedItems,
    totalCount,
    page,
    pageSize,
    dateFilter,
    query,
  }
}

export const fetchUnreadStudyFeedbackDates = cache(
  async (studentId: string): Promise<Set<string>> => {
    const supabase = await createClient()

    const [{ data: feedbackRows, error: feedbackError }, { data: readRows, error: readError }] =
      await Promise.all([
        supabase
          .from('study_day_feedback')
          .select('id, comment, studied_on')
          .eq('student_id', studentId),
        supabase
          .from('study_day_feedback_reads')
          .select('feedback_id, comment_at_read')
          .eq('student_id', studentId),
      ])

    if (feedbackError || readError) {
      return new Set()
    }

    const commentAtReadById = new Map(
      (readRows ?? []).map((row) => [
        row.feedback_id as string,
        String(row.comment_at_read ?? ''),
      ]),
    )
    const unreadDates = new Set<string>()

    for (const row of feedbackRows ?? []) {
      const id = row.id as string
      const hasRow = commentAtReadById.has(id)
      if (
        isStudyFeedbackUnread({
          comment: row.comment as string,
          commentAtRead: hasRow ? commentAtReadById.get(id)! : null,
          hasRead: hasRow,
        })
      ) {
        unreadDates.add(row.studied_on as string)
      }
    }

    return unreadDates
  },
)

export const fetchUnreadStudyFeedbackCount = cache(async (studentId: string): Promise<number> => {
  const unreadDates = await fetchUnreadStudyFeedbackDates(studentId)
  return unreadDates.size
})

/** Snapshot of unread feedback ids for this student (shared badge definition). */
export async function listUnreadStudyFeedbackIds(
  studentId: string,
): Promise<string[]> {
  const supabase = await createClient()

  const [{ data: feedbackRows, error: feedbackError }, { data: readRows, error: readError }] =
    await Promise.all([
      supabase
        .from('study_day_feedback')
        .select('id, comment')
        .eq('student_id', studentId),
      supabase
        .from('study_day_feedback_reads')
        .select('feedback_id, comment_at_read')
        .eq('student_id', studentId),
    ])

  if (feedbackError || readError) return []

  const commentAtReadById = new Map(
    (readRows ?? []).map((row) => [
      row.feedback_id as string,
      String(row.comment_at_read ?? ''),
    ]),
  )
  return (feedbackRows ?? [])
    .filter((row) => {
      const id = row.id as string
      const hasRow = commentAtReadById.has(id)
      return isStudyFeedbackUnread({
        comment: row.comment as string,
        commentAtRead: hasRow ? commentAtReadById.get(id)! : null,
        hasRead: hasRow,
      })
    })
    .map((row) => row.id as string)
}

export async function fetchStudyFeedbackCommentsPage(params: {
  studentId: string
  filter: StudyFeedbackCommentFilter
  page?: number
  pageSize?: number
}): Promise<StudyFeedbackCommentPage> {
  const pageSize = params.pageSize ?? 15
  const supabase = await createClient()

  const [{ data: feedbackRows, error: feedbackError }, { data: readRows, error: readError }] =
    await Promise.all([
      supabase
        .from('study_day_feedback')
        .select('id, student_id, studied_on, stamp, comment, updated_at, created_at')
        .eq('student_id', params.studentId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('study_day_feedback_reads')
        .select('feedback_id, comment_at_read')
        .eq('student_id', params.studentId),
    ])

  if (feedbackError || readError) {
    return {
      items: [],
      totalCount: 0,
      page: 1,
      pageSize,
      filter: params.filter,
      unreadCount: 0,
    }
  }

  const commentAtReadById = new Map(
    (readRows ?? []).map((row) => [
      row.feedback_id as string,
      String(row.comment_at_read ?? ''),
    ]),
  )

  const withComment = ((feedbackRows ?? []) as StudyDayFeedback[]).filter((row) =>
    hasReadableStudyFeedbackComment(row.comment),
  )

  const annotated = withComment.map((row) => {
    const hasRow = commentAtReadById.has(row.id)
    return {
      feedback: row,
      isUnread: isStudyFeedbackUnread({
        comment: row.comment,
        commentAtRead: hasRow ? commentAtReadById.get(row.id)! : null,
        hasRead: hasRow,
      }),
    }
  })

  const unreadCount = annotated.filter((row) => row.isUnread).length
  const filtered =
    params.filter === 'unread' ? annotated.filter((row) => row.isUnread) : annotated

  const totalCount = filtered.length
  const totalPages = getTotalPages(totalCount, pageSize)
  const page = parsePageParam(
    params.page != null ? String(params.page) : undefined,
    totalPages,
  )
  const start = (page - 1) * pageSize
  const pageRows = filtered.slice(start, start + pageSize)

  const studiedOns = [...new Set(pageRows.map((row) => row.feedback.studied_on))]
  const contextByDate = await fetchStudyDayContextLabels(params.studentId, studiedOns)

  return {
    items: pageRows.map(({ feedback, isUnread }) => {
      const ctx = contextByDate.get(feedback.studied_on) ?? {
        subjects: [] as string[],
        textbookNames: [] as string[],
      }
      return {
        feedbackId: feedback.id,
        studiedOn: feedback.studied_on,
        comment: feedback.comment.trim(),
        stamp: feedback.stamp,
        updatedAt: feedback.updated_at,
        isUnread,
        subjects: ctx.subjects,
        textbookNames: ctx.textbookNames,
      }
    }),
    totalCount,
    page,
    pageSize,
    filter: params.filter,
    unreadCount,
  }
}

async function fetchStudyDayContextLabels(
  studentId: string,
  studiedOns: string[],
): Promise<Map<string, { subjects: string[]; textbookNames: string[] }>> {
  const map = new Map<string, { subjects: string[]; textbookNames: string[] }>()
  if (studiedOns.length === 0) return map

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('study_logs')
    .select('studied_on, subject, textbook_name')
    .eq('student_id', studentId)
    .in('studied_on', studiedOns)

  if (error || !data) return map

  for (const row of data) {
    const date = String(row.studied_on)
    const entry = map.get(date) ?? { subjects: [], textbookNames: [] }
    const subject = String(row.subject ?? '').trim()
    const textbook = String(row.textbook_name ?? '').trim()
    if (subject && !entry.subjects.includes(subject)) entry.subjects.push(subject)
    if (textbook && !entry.textbookNames.includes(textbook)) {
      entry.textbookNames.push(textbook)
    }
    map.set(date, entry)
  }

  return map
}

/**
 * Mark feedback as read for the owning student only.
 * Returns ok:false on authz/ownership/write failure (callers must not ignore).
 */
export async function markStudyFeedbackAsRead(
  feedbackId: string,
  studentId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const trimmedId = feedbackId.trim()
  if (!trimmedId) return { ok: false, reason: 'invalid_id' }

  const supabase = await createClient()
  const { data: feedback, error: feedbackError } = await supabase
    .from('study_day_feedback')
    .select('id, student_id, comment')
    .eq('id', trimmedId)
    .maybeSingle<{ id: string; student_id: string; comment: string }>()

  if (feedbackError || !feedback) return { ok: false, reason: 'not_found' }
  if (feedback.student_id !== studentId) return { ok: false, reason: 'forbidden' }
  if (!hasReadableStudyFeedbackComment(feedback.comment)) {
    return { ok: true }
  }

  const { error } = await supabase.from('study_day_feedback_reads').upsert(
    {
      feedback_id: feedback.id,
      student_id: studentId,
      read_at: new Date().toISOString(),
      comment_at_read: normalizeFeedbackCommentForRead(feedback.comment),
    },
    { onConflict: 'feedback_id,student_id' },
  )

  if (error) {
    console.error('[study-feedback] mark read failed:', error.message)
    return { ok: false, reason: 'write_failed' }
  }
  return { ok: true }
}

/**
 * Mark only the provided feedback ids (snapshot). Ignores ids that are not
 * owned by the student. Does not expand to newly arrived unread rows.
 */
export async function markStudyFeedbackIdsAsRead(
  feedbackIds: string[],
  studentId: string,
): Promise<{ marked: number; failed: number }> {
  const uniqueIds = [...new Set(feedbackIds.map((id) => id.trim()).filter(Boolean))]
  let marked = 0
  let failed = 0
  for (const id of uniqueIds) {
    const result = await markStudyFeedbackAsRead(id, studentId)
    if (result.ok) marked += 1
    else failed += 1
  }
  return { marked, failed }
}

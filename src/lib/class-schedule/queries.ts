import { createClient } from '@/lib/supabase/server'
import { getJstDateKey } from '@/lib/study/dates'
import { DEFAULT_PAGE_SIZE, getTotalPages, parsePageParam } from '@/lib/pagination'
import type {
  ClassScheduleDay,
  ClassScheduleDayWithSessions,
  ClassScheduleSession,
} from '@/types/class-schedule'

function normalizeTime(value: string): string {
  return value.length >= 5 ? value.slice(0, 5) : value
}

function normalizeSession(row: ClassScheduleSession): ClassScheduleSession {
  return {
    ...row,
    start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time),
  }
}

function attachSessions(
  days: ClassScheduleDay[],
  sessions: ClassScheduleSession[],
): ClassScheduleDayWithSessions[] {
  const byDay = new Map<string, ClassScheduleSession[]>()
  for (const session of sessions) {
    const list = byDay.get(session.day_id) ?? []
    list.push(normalizeSession(session))
    byDay.set(session.day_id, list)
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.start_time.localeCompare(b.start_time))
  }
  return days.map((day) => ({
    ...day,
    sessions: byDay.get(day.id) ?? [],
  }))
}

async function fetchSessionsForDayIds(
  dayIds: string[],
): Promise<ClassScheduleSession[]> {
  if (dayIds.length === 0) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('class_schedule_sessions')
    .select('*')
    .in('day_id', dayIds)
    .order('start_time')
  return (data as ClassScheduleSession[] | null) ?? []
}

export async function fetchClassScheduleDayById(
  dayId: string,
): Promise<ClassScheduleDayWithSessions | null> {
  const supabase = await createClient()
  const { data: day } = await supabase
    .from('class_schedule_days')
    .select('*')
    .eq('id', dayId)
    .maybeSingle<ClassScheduleDay>()

  if (!day) return null

  const sessions = await fetchSessionsForDayIds([day.id])
  return attachSessions([day], sessions)[0] ?? null
}

export type ClassScheduleListScope = 'upcoming' | 'past' | 'all'

export type ClassScheduleDaysPage = {
  days: ClassScheduleDayWithSessions[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export async function fetchClassScheduleDaysPaginated(options: {
  scope: ClassScheduleListScope
  page?: number
  pageSize?: number
  /** Inclusive "today" key; defaults to JST today. */
  todayKey?: string
  /**
   * For scope=upcoming only: exclude the「次の授業」day from count + page
   * so totals/pages stay consistent (do not filter after range()).
   */
  excludeDayId?: string | null
  excludeScheduleDate?: string | null
}): Promise<ClassScheduleDaysPage> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const todayKey = options.todayKey ?? getJstDateKey()
  const supabase = await createClient()

  let countQuery = supabase
    .from('class_schedule_days')
    .select('id', { count: 'exact', head: true })

  if (options.scope === 'upcoming') {
    countQuery = countQuery.gte('schedule_date', todayKey)
    if (options.excludeDayId) {
      countQuery = countQuery.neq('id', options.excludeDayId)
    }
    if (options.excludeScheduleDate) {
      countQuery = countQuery.neq('schedule_date', options.excludeScheduleDate)
    }
  } else if (options.scope === 'past') {
    countQuery = countQuery.lt('schedule_date', todayKey)
  }

  const { count: rawCount } = await countQuery
  const totalCount = rawCount ?? 0
  const totalPages = getTotalPages(totalCount, pageSize)
  const page = parsePageParam(String(options.page ?? 1), totalPages)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let dataQuery = supabase.from('class_schedule_days').select('*')

  if (options.scope === 'upcoming') {
    dataQuery = dataQuery
      .gte('schedule_date', todayKey)
      .order('schedule_date', { ascending: true })
    if (options.excludeDayId) {
      dataQuery = dataQuery.neq('id', options.excludeDayId)
    }
    if (options.excludeScheduleDate) {
      dataQuery = dataQuery.neq('schedule_date', options.excludeScheduleDate)
    }
  } else if (options.scope === 'past') {
    dataQuery = dataQuery
      .lt('schedule_date', todayKey)
      .order('schedule_date', { ascending: false })
  } else {
    dataQuery = dataQuery.order('schedule_date', { ascending: false })
  }

  const { data } = await dataQuery.range(from, to)
  const days = (data as ClassScheduleDay[] | null) ?? []
  const sessions = await fetchSessionsForDayIds(days.map((d) => d.id))

  return {
    days: attachSessions(days, sessions),
    page,
    pageSize,
    totalCount,
    totalPages,
  }
}

export type NextClassDay = ClassScheduleDayWithSessions

/**
 * Selects the nearest *day* that still has at least one remaining scheduled
 * session (JST). Once selected, returns that day with **all** sessions
 * (scheduled + cancelled, including already-ended ones today) so the student
 * sees the full day plan — not only the next slot.
 */
export function pickNextClassDay(
  days: ClassScheduleDayWithSessions[],
  todayKey: string,
  nowTimeHHmm: string,
): NextClassDay | null {
  for (const day of days) {
    if (day.status !== 'scheduled') continue
    const hasRemaining = day.sessions.some((session) => {
      if (session.status !== 'scheduled') return false
      if (day.schedule_date > todayKey) return true
      if (day.schedule_date < todayKey) return false
      return session.end_time > nowTimeHHmm
    })
    if (!hasRemaining) continue
    return day
  }
  return null
}

/**
 * Remove the day shown in「次の授業」from「今後の予定」(day-level).
 * Matches by id and schedule_date so the same calendar day never appears twice.
 * Cancelled days skipped by pickNextClassDay are kept when they are a different day.
 */
export function excludeNextClassDayFromUpcoming(
  days: ClassScheduleDayWithSessions[],
  next: Pick<NextClassDay, 'id' | 'schedule_date'> | null,
): ClassScheduleDayWithSessions[] {
  if (!next) return days
  return days.filter(
    (day) => day.id !== next.id && day.schedule_date !== next.schedule_date,
  )
}

/** Split one upcoming list into next-hero day + remaining upcoming days. */
export function splitNextAndUpcomingClassDays(
  days: ClassScheduleDayWithSessions[],
  todayKey: string,
  nowTimeHHmm: string,
): {
  next: NextClassDay | null
  upcoming: ClassScheduleDayWithSessions[]
} {
  const next = pickNextClassDay(days, todayKey, nowTimeHHmm)
  return {
    next,
    upcoming: excludeNextClassDayFromUpcoming(days, next),
  }
}

export function upcomingClassScheduleEmptyMessage(hasNext: boolean): string {
  return hasNext
    ? '次回以降の予定はありません'
    : '今後の授業予定はありません。'
}

export function getJstWallClockHHmm(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now)
}

export async function fetchNextClassDay(
  todayKey = getJstDateKey(),
  nowTimeHHmm?: string,
): Promise<NextClassDay | null> {
  const now = nowTimeHHmm ?? getJstWallClockHHmm()
  const days = await fetchUpcomingClassScheduleDays({ todayKey, limit: 90 })
  return pickNextClassDay(days, todayKey, now)
}

/**
 * Student dashboard overview: one upcoming fetch, then split so「次の授業」
 * and「今後の予定」never share the same day (no N+1).
 */
export async function fetchStudentClassScheduleOverview(options?: {
  todayKey?: string
  nowTimeHHmm?: string
  limit?: number
}): Promise<{
  next: NextClassDay | null
  upcoming: ClassScheduleDayWithSessions[]
}> {
  const todayKey = options?.todayKey ?? getJstDateKey()
  const now = options?.nowTimeHHmm ?? getJstWallClockHHmm()
  const days = await fetchUpcomingClassScheduleDays({
    todayKey,
    limit: options?.limit ?? 90,
  })
  return splitNextAndUpcomingClassDays(days, todayKey, now)
}

/** @deprecated Prefer fetchNextClassDay — kept for transitional imports. */
export type NextClassSession = {
  day: ClassScheduleDay
  session: ClassScheduleSession
}

/** @deprecated Prefer fetchNextClassDay */
export async function fetchNextClassSession(
  todayKey = getJstDateKey(),
  nowTimeHHmm?: string,
): Promise<NextClassSession | null> {
  const day = await fetchNextClassDay(todayKey, nowTimeHHmm)
  if (!day || day.sessions.length === 0) return null
  return { day, session: day.sessions[0]! }
}

export async function fetchUpcomingClassScheduleDays(options?: {
  todayKey?: string
  limit?: number
  /** Exclude the「次の授業」day at query time (id and/or JST date key). */
  excludeDayId?: string | null
  excludeScheduleDate?: string | null
}): Promise<ClassScheduleDayWithSessions[]> {
  const todayKey = options?.todayKey ?? getJstDateKey()
  const limit = options?.limit ?? 20
  const supabase = await createClient()

  let query = supabase
    .from('class_schedule_days')
    .select('*')
    .gte('schedule_date', todayKey)
    .order('schedule_date', { ascending: true })
    .limit(limit)

  if (options?.excludeDayId) {
    query = query.neq('id', options.excludeDayId)
  }
  if (options?.excludeScheduleDate) {
    query = query.neq('schedule_date', options.excludeScheduleDate)
  }

  const { data } = await query
  const days = (data as ClassScheduleDay[] | null) ?? []
  const sessions = await fetchSessionsForDayIds(days.map((d) => d.id))
  return attachSessions(days, sessions)
}

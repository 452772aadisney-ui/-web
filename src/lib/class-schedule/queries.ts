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
}): Promise<ClassScheduleDaysPage> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const todayKey = options.todayKey ?? getJstDateKey()
  const supabase = await createClient()

  let countQuery = supabase
    .from('class_schedule_days')
    .select('id', { count: 'exact', head: true })

  if (options.scope === 'upcoming') {
    countQuery = countQuery.gte('schedule_date', todayKey)
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

export type NextClassSession = {
  day: ClassScheduleDay
  session: ClassScheduleSession
}

/**
 * Next upcoming scheduled session for student hero.
 * Prefer today (remaining sessions), else earliest future scheduled day/session.
 * Skips cancelled days and cancelled sessions.
 */
export async function fetchNextClassSession(
  todayKey = getJstDateKey(),
  nowTimeHHmm?: string,
): Promise<NextClassSession | null> {
  const supabase = await createClient()
  const now =
    nowTimeHHmm ??
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date())

  const { data: days } = await supabase
    .from('class_schedule_days')
    .select('*')
    .eq('status', 'scheduled')
    .gte('schedule_date', todayKey)
    .order('schedule_date', { ascending: true })
    .limit(30)

  const dayList = (days as ClassScheduleDay[] | null) ?? []
  if (dayList.length === 0) return null

  const sessions = await fetchSessionsForDayIds(dayList.map((d) => d.id))
  const withSessions = attachSessions(dayList, sessions)

  for (const day of withSessions) {
    const scheduled = day.sessions.filter((s) => s.status === 'scheduled')
    for (const session of scheduled) {
      if (day.schedule_date > todayKey) {
        return { day, session }
      }
      // today: only sessions that have not ended yet
      if (session.end_time > now) {
        return { day, session }
      }
    }
  }

  return null
}

export async function fetchUpcomingClassScheduleDays(options?: {
  todayKey?: string
  limit?: number
}): Promise<ClassScheduleDayWithSessions[]> {
  const todayKey = options?.todayKey ?? getJstDateKey()
  const limit = options?.limit ?? 20
  const supabase = await createClient()

  const { data } = await supabase
    .from('class_schedule_days')
    .select('*')
    .gte('schedule_date', todayKey)
    .order('schedule_date', { ascending: true })
    .limit(limit)

  const days = (data as ClassScheduleDay[] | null) ?? []
  const sessions = await fetchSessionsForDayIds(days.map((d) => d.id))
  return attachSessions(days, sessions)
}

import { getJstDateKey } from '@/lib/study/dates'

/** Keep today's booking visible until the JST date changes. */
export function isTodayOrFutureCoaching(startsAt: string, now = new Date()): boolean {
  const start = new Date(startsAt)
  return Number.isFinite(start.getTime()) && getJstDateKey(start) >= getJstDateKey(now)
}

/**
 * Source booking eligibility for reschedule.
 * Admin: JST today-or-future (started today OK). Student: start must still be in the future.
 */
export function canRescheduleCoachingSource(
  startsAt: string,
  actor: 'admin' | 'student',
  now = new Date(),
): boolean {
  return actor === 'admin'
    ? isTodayOrFutureCoaching(startsAt, now)
    : new Date(startsAt).getTime() > now.getTime()
}

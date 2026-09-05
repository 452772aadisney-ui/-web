import { getJstDateKey } from '@/lib/study/dates'

/** Pure calendar-date arithmetic on YYYY-MM-DD (no local TZ). */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/**
 * Monday of the JST week containing `now` (Mon–Sun).
 */
export function getJstWeekMondayDateKey(now = new Date()): string {
  const today = getJstDateKey(now)
  const probe = new Date(`${today}T12:00:00+09:00`)
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
  }).format(probe)
  const idx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday)
  const offset = idx >= 0 ? idx : 0
  return addDaysToDateKey(today, -offset)
}

/** Mon–Sun date keys for the JST week starting at mondayKey. */
export function getJstWeekDateKeys(mondayKey: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToDateKey(mondayKey, i))
}

export function getJstTomorrowDateKey(now = new Date()): string {
  return addDaysToDateKey(getJstDateKey(now), 1)
}

/** HH:mm in Asia/Tokyo from an ISO/timestamptz instant. */
export function formatJstHm(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  if (Number.isNaN(date.getTime())) return '00:00'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${hour}:${minute}`
}

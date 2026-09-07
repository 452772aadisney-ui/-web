import { formatJstDateLabelFromDateKey } from '@/lib/datetime/format-jst'
import type { ClassScheduleDayWithSessions } from '@/types/class-schedule'

export const classScheduleFieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

export function formatClassScheduleDateLabel(dateKey: string): string {
  return formatJstDateLabelFromDateKey(dateKey)
}

export function formatSessionTimeRange(start: string, end: string): string {
  return `${start.slice(0, 5)}–${end.slice(0, 5)}`
}

export function isHttpsMapUrl(url: string | null | undefined): url is string {
  if (!url) return false
  return /^https:\/\//i.test(url.trim())
}

export function dayStatusLabel(status: ClassScheduleDayWithSessions['status']): string {
  return status === 'cancelled' ? '中止' : '予定'
}

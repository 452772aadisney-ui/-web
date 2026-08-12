import {
  COACHING_SLOT_DURATION_MINUTES,
  addMinutesToTime,
  normalizeStartTime,
} from '@/lib/coaching/slot-times'

export function formatCoachingDateTimeRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const date = start.toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  })
  const startTime = start.toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  })
  const endTime = end.toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${date} ${startTime}〜${endTime}`
}

export function formatCoachingSlotDateTime(slotDate: string, startTime: string): string {
  const time = normalizeStartTime(startTime)
  const endTime = addMinutesToTime(time, COACHING_SLOT_DURATION_MINUTES)
  return `${formatCoachingDateLabel(slotDate)} ${time}〜${endTime}`
}

export function formatCoachingBookingDateTime(
  slotDate: string | null | undefined,
  startTime: string | null | undefined,
  startsAt: string,
  endsAt: string,
): string {
  if (slotDate && startTime) {
    return formatCoachingSlotDateTime(slotDate, startTime)
  }
  return formatCoachingDateTimeRange(startsAt, endsAt)
}

export function formatCoachingDateKey(startsAt: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
  }).format(new Date(startsAt))
}

export function formatCoachingDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  })
}

import { formatCoachingDateLabel } from '@/lib/coaching/format'
import { normalizeStartTime } from '@/lib/coaching/slot-times'
import type { CoachingBookingWithDetails } from '@/types/coaching'

export function getCoachingBookingDateKey(booking: CoachingBookingWithDetails): string {
  return booking.slot.slot_date ?? booking.slot.starts_at.slice(0, 10)
}

export function getCoachingBookingStartTimeKey(booking: CoachingBookingWithDetails): string {
  if (booking.slot.start_time) return normalizeStartTime(booking.slot.start_time)
  return booking.slot.starts_at
}

/** Ascending start within a day, then stable id. */
export function compareBookingsByStartAsc(
  a: CoachingBookingWithDetails,
  b: CoachingBookingWithDetails,
): number {
  const byTime = getCoachingBookingStartTimeKey(a).localeCompare(
    getCoachingBookingStartTimeKey(b),
  )
  if (byTime !== 0) return byTime
  return a.id.localeCompare(b.id)
}

export function splitUpcomingCoachingBookings(
  bookings: CoachingBookingWithDetails[],
  todayKey: string,
): {
  todayBookings: CoachingBookingWithDetails[]
  futureBookings: CoachingBookingWithDetails[]
} {
  const todayBookings: CoachingBookingWithDetails[] = []
  const futureBookings: CoachingBookingWithDetails[] = []

  for (const booking of bookings) {
    const dateKey = getCoachingBookingDateKey(booking)
    if (dateKey === todayKey) todayBookings.push(booking)
    else if (dateKey > todayKey) futureBookings.push(booking)
  }

  todayBookings.sort(compareBookingsByStartAsc)
  futureBookings.sort(compareBookingsByStartAsc)

  return { todayBookings, futureBookings }
}

export type CoachingBookingDateGroup = {
  dateKey: string
  label: string
  bookings: CoachingBookingWithDetails[]
}

/** Group bookings by slot date; times ascend within each day. */
export function groupCoachingBookingsByDate(
  bookings: CoachingBookingWithDetails[],
  dateOrder: 'asc' | 'desc' = 'asc',
): CoachingBookingDateGroup[] {
  const byDate = new Map<string, CoachingBookingWithDetails[]>()

  for (const booking of bookings) {
    const dateKey = getCoachingBookingDateKey(booking)
    const list = byDate.get(dateKey) ?? []
    list.push(booking)
    byDate.set(dateKey, list)
  }

  return [...byDate.keys()]
    .sort((a, b) => (dateOrder === 'asc' ? a.localeCompare(b) : b.localeCompare(a)))
    .map((dateKey) => ({
      dateKey,
      label: formatCoachingDateLabel(dateKey),
      bookings: (byDate.get(dateKey) ?? []).slice().sort(compareBookingsByStartAsc),
    }))
}

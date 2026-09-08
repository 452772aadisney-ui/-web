import type { CoachingBookingWithDetails } from '@/types/coaching'

export function getCoachingBookingDateKey(booking: CoachingBookingWithDetails): string {
  return booking.slot.slot_date ?? booking.slot.starts_at.slice(0, 10)
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

  todayBookings.sort((a, b) => a.slot.starts_at.localeCompare(b.slot.starts_at))
  futureBookings.sort((a, b) => a.slot.starts_at.localeCompare(b.slot.starts_at))

  return { todayBookings, futureBookings }
}

import type { CoachingBookingWithDetails } from '@/types/coaching'

export const COACHING_INTERVAL_DAYS = 7

export interface CoachingAlertState {
  showAlert: boolean
  message: string
  daysSinceLast: number | null
  hasUpcoming: boolean
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export function getCoachingAlertState(
  bookings: CoachingBookingWithDetails[],
  now = new Date(),
): CoachingAlertState {
  const active = bookings.filter((b) => b.status !== 'cancelled')
  const upcoming = active.filter(
    (b) => b.status === 'scheduled' && new Date(b.slot.starts_at) > now,
  )
  const past = active.filter((b) => new Date(b.slot.starts_at) <= now)

  const lastSession = past.sort(
    (a, b) => new Date(b.slot.starts_at).getTime() - new Date(a.slot.starts_at).getTime(),
  )[0]

  const daysSinceLast = lastSession
    ? daysBetween(new Date(lastSession.slot.starts_at), now)
    : null

  const overdue = daysSinceLast === null || daysSinceLast >= COACHING_INTERVAL_DAYS
  const hasUpcoming = upcoming.length > 0
  const showAlert = overdue && !hasUpcoming

  let message = ''
  if (showAlert) {
    if (daysSinceLast === null) {
      message = 'まだコーチングを受けていません。週1回コーチングを受けましょう。'
    } else {
      message = `前回から${daysSinceLast}日経過しています。週1回コーチングを受けましょう。`
    }
  }

  return {
    showAlert,
    message,
    daysSinceLast,
    hasUpcoming,
  }
}

export function getNextCoachingBooking(
  bookings: CoachingBookingWithDetails[],
  now = new Date(),
): CoachingBookingWithDetails | null {
  const upcoming = bookings
    .filter((booking) => booking.status === 'scheduled' && new Date(booking.slot.starts_at) > now)
    .sort(
      (a, b) =>
        new Date(a.slot.starts_at).getTime() - new Date(b.slot.starts_at).getTime(),
    )

  return upcoming[0] ?? null
}

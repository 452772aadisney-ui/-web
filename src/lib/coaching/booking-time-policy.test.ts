import { describe, expect, it } from 'vitest'
import { canRescheduleCoachingSource } from './booking-time-policy'
import { getCoachingAlertState, getNextCoachingBooking } from './alert'
import type { CoachingBookingWithDetails, CoachingBookingStatus } from '@/types/coaching'
import { readFileSync } from 'node:fs'

const now = new Date('2026-10-02T17:05:00+09:00')
const start = '2026-10-02T17:00:00+09:00'

function booking(starts_at: string, status: CoachingBookingStatus = 'scheduled') {
  return { status, slot: { starts_at } } as CoachingBookingWithDetails
}

describe('same-day coaching', () => {
  it('allows admins, but not students, to move a started booking today', () => {
    expect(canRescheduleCoachingSource(start, 'admin', now)).toBe(true)
    expect(canRescheduleCoachingSource(start, 'student', now)).toBe(false)
    expect(canRescheduleCoachingSource(start, 'admin', new Date(start))).toBe(true)
    expect(canRescheduleCoachingSource(start, 'student', new Date(start))).toBe(false)
  })

  it('rejects yesterday and invalid dates; retains future student changes', () => {
    expect(canRescheduleCoachingSource('2026-10-01T17:00:00+09:00', 'admin', now)).toBe(false)
    expect(canRescheduleCoachingSource('invalid', 'admin', now)).toBe(false)
    expect(canRescheduleCoachingSource('2026-10-02T18:00:00+09:00', 'student', now)).toBe(true)
  })

  it('uses the JST midnight boundary, not UTC', () => {
    // 2026-10-02 23:59:59 JST = 14:59:59Z; 2026-10-03 00:00:00 JST = 15:00:00Z
    expect(canRescheduleCoachingSource(start, 'admin', new Date('2026-10-02T14:59:59Z'))).toBe(true)
    expect(canRescheduleCoachingSource(start, 'admin', new Date('2026-10-02T15:00:00Z'))).toBe(false)
  })

  it('keeps today ahead of future bookings after start, but drops it next day', () => {
    const today = booking(start)
    const future = booking('2026-10-05T17:00:00+09:00')
    expect(getNextCoachingBooking([future, today], now)).toBe(today)
    expect(getNextCoachingBooking([today], new Date('2026-10-02T16:00:00+09:00'))).toBe(today)
    expect(getNextCoachingBooking([future, today], new Date('2026-10-03T00:00:00+09:00'))).toBe(
      future,
    )
  })

  it('does not display completed, absent or cancelled bookings', () => {
    expect(
      getNextCoachingBooking(
        [booking(start, 'completed'), booking(start, 'no_show'), booking(start, 'cancelled')],
        now,
      ),
    ).toBeNull()
  })

  it('does not hide the home next-coaching banner with the reservation nudge after start', () => {
    const todayStarted = booking(start)
    const alert = getCoachingAlertState([todayStarted], now)
    expect(alert.hasUpcoming).toBe(true)
    expect(alert.showAlert).toBe(false)
    expect(getNextCoachingBooking([todayStarted], now)).toBe(todayStarted)
  })

  it('wires source policy without relaxing destination, status or CAS guards', () => {
    const source = readFileSync('src/app/coaching/actions.ts', 'utf8')
    const adminUi = readFileSync('src/components/coaching/AdminCoachingBookings.tsx', 'utf8')
    const studentUi = readFileSync('src/components/coaching/StudentCoachingBooking.tsx', 'utf8')
    const dashboard = readFileSync('src/app/dashboard/page.tsx', 'utf8')
    const myPage = readFileSync('src/components/student/MyPageActions.tsx', 'utf8')

    expect(source).toContain(
      'canRescheduleCoachingSource(booking.coaching_slots.starts_at, params.actor)',
    )
    expect(source).toContain('new Date(newSlot.starts_at) <= new Date()')
    expect(source).toContain("booking.status !== 'scheduled'")
    expect(source).toContain(".eq('schedule_revision', observedRevision)")
    expect(adminUi).toContain("const showReschedule = appearance === 'always'")
    expect(studentUi).toContain(
      "b.status === 'scheduled' && new Date(b.slot.starts_at) > new Date()",
    )
    expect(dashboard).toContain('getNextCoachingBooking(coachingBookings)')
    expect(myPage).toContain('showNextCoachingBanner = !hideCoaching && !coachingAlertMessage')
  })
})

import { describe, expect, it } from 'vitest'
import { splitUpcomingCoachingBookings } from '@/lib/coaching/admin-bookings-list'
import type { CoachingBookingWithDetails } from '@/types/coaching'

function booking(
  id: string,
  slotDate: string,
  startsAt = `${slotDate}T01:00:00.000Z`,
): CoachingBookingWithDetails {
  return {
    id,
    slot_id: `slot-${id}`,
    student_id: 's1',
    coach_id: 'c1',
    student_note: '',
    status: 'scheduled',
    google_calendar_event_id: null,
    booked_at: startsAt,
    created_at: startsAt,
    updated_at: startsAt,
    slot: {
      id: `slot-${id}`,
      coach_id: 'c1',
      slot_date: slotDate,
      start_time: '10:00',
      is_open: true,
      starts_at: startsAt,
      ends_at: `${slotDate}T02:00:00.000Z`,
      created_at: startsAt,
    },
    coach: { id: 'c1', name: '講師' },
    student: { id: 's1', full_name: '生徒', display_name: '生徒' },
  }
}

describe('splitUpcomingCoachingBookings', () => {
  it('splits today and future and sorts ascending by start', () => {
    const { todayBookings, futureBookings } = splitUpcomingCoachingBookings(
      [
        booking('f2', '2026-09-10', '2026-09-10T03:00:00.000Z'),
        booking('t2', '2026-09-08', '2026-09-08T03:00:00.000Z'),
        booking('f1', '2026-09-09', '2026-09-09T01:00:00.000Z'),
        booking('t1', '2026-09-08', '2026-09-08T01:00:00.000Z'),
      ],
      '2026-09-08',
    )

    expect(todayBookings.map((b) => b.id)).toEqual(['t1', 't2'])
    expect(futureBookings.map((b) => b.id)).toEqual(['f1', 'f2'])
  })
})

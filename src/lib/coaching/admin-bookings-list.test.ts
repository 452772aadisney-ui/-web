import { describe, expect, it } from 'vitest'
import {
  groupCoachingBookingsByDate,
  splitUpcomingCoachingBookings,
} from '@/lib/coaching/admin-bookings-list'
import type { CoachingBookingWithDetails } from '@/types/coaching'
import { readFileSync } from 'node:fs'
import path from 'node:path'

function booking(
  id: string,
  slotDate: string,
  startTime: string,
  startsAt = `${slotDate}T${startTime}:00+09:00`,
): CoachingBookingWithDetails {
  return {
    id,
    slot_id: `slot-${id}`,
    student_id: 's1',
    coach_id: 'c1',
    student_note: id === 'note' ? '伝言です' : '',
    status: 'scheduled',
    google_calendar_event_id: null,
    schedule_revision: `rev-${id}`,
    google_calendar_etag: null,
    booked_at: startsAt,
    created_at: startsAt,
    updated_at: startsAt,
    slot: {
      id: `slot-${id}`,
      coach_id: 'c1',
      slot_date: slotDate,
      start_time: startTime,
      is_open: true,
      starts_at: startsAt,
      ends_at: startsAt,
      created_at: startsAt,
    },
    coach: { id: 'c1', name: '講師' },
    student: { id: 's1', full_name: '生徒', display_name: '生徒' },
  }
}

describe('future booking date grouping', () => {
  it('groups same day into one card and sorts dates/times ascending', () => {
    const groups = groupCoachingBookingsByDate(
      [
        booking('b', '2026-09-10', '16:00'),
        booking('a', '2026-09-09', '17:00'),
        booking('c', '2026-09-09', '13:30'),
        booking('d', '2026-09-09', '13:30'),
      ],
      'asc',
    )

    expect(groups.map((g) => g.dateKey)).toEqual(['2026-09-09', '2026-09-10'])
    expect(groups[0]?.bookings.map((b) => b.id)).toEqual(['c', 'd', 'a'])
    expect(groups).toHaveLength(2)
  })

  it('keeps today and future split with ascending times', () => {
    const { todayBookings, futureBookings } = splitUpcomingCoachingBookings(
      [
        booking('f', '2026-09-10', '10:00'),
        booking('t2', '2026-09-08', '16:00'),
        booking('t1', '2026-09-08', '10:00'),
      ],
      '2026-09-08',
    )
    expect(todayBookings.map((b) => b.id)).toEqual(['t1', 't2'])
    expect(futureBookings.map((b) => b.id)).toEqual(['f'])
  })
})

describe('past booking query order wiring', () => {
  it('orders booking-unit sort keys before paging (not slot-root range)', () => {
    const queries = readFileSync(
      path.join(process.cwd(), 'src/lib/coaching/queries.ts'),
      'utf8',
    )
    const pastFn = queries.slice(queries.indexOf('fetchPastCoachingBookingsForAdmin'))
    expect(pastFn).toContain('comparePastCoachingBookingSortKeys')
    expect(pastFn).toContain(".from('coaching_bookings')")
    expect(pastFn).not.toContain("foreignTable: 'coaching_slots'")
  })
})

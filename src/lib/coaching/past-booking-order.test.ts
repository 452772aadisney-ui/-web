import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { sortPastCoachingBookingSortKeys } from '@/lib/coaching/past-booking-order'

describe('past coaching booking sort keys', () => {
  it('orders date DESC, same-day time ASC, then id ASC across page boundaries', () => {
    const ordered = sortPastCoachingBookingSortKeys([
      { id: 'b', slot_date: '2026-09-01', start_time: '11:00' },
      { id: 'a', slot_date: '2026-09-02', start_time: '10:00' },
      { id: 'c', slot_date: '2026-09-01', start_time: '10:00' },
      { id: 'd', slot_date: '2026-09-01', start_time: '10:00' },
      { id: 'e', slot_date: '2026-09-02', start_time: '11:00' },
    ])
    expect(ordered.map((row) => row.id)).toEqual(['a', 'e', 'c', 'd', 'b'])

    const page1 = ordered.slice(0, 2).map((row) => row.id)
    const page2 = ordered.slice(2, 4).map((row) => row.id)
    expect(page1).toEqual(['a', 'e'])
    expect(page2).toEqual(['c', 'd'])
  })

  it('counts booking rows, not slots, when multiple non-cancelled bookings share a slot', () => {
    // Schema (022): unique(slot_id) only for status=scheduled — completed/no_show
    // may coexist historically. Pagination must be booking-unit.
    const keys = sortPastCoachingBookingSortKeys([
      { id: 'booking-1', slot_date: '2026-08-01', start_time: '10:00' },
      { id: 'booking-2', slot_date: '2026-08-01', start_time: '10:00' },
    ])
    expect(keys).toHaveLength(2)
  })
})

describe('past booking query wiring (booking-unit)', () => {
  it('loads sort keys from coaching_bookings then pages detail by booking id', () => {
    const queries = readFileSync(
      path.join(process.cwd(), 'src/lib/coaching/queries.ts'),
      'utf8',
    )
    const start = queries.indexOf('fetchPastCoachingBookingsForAdmin')
    const end = queries.indexOf('export async function fetchCoachingBookingBySlotId')
    const pastFn = queries.slice(start, end)
    expect(pastFn).toContain(".from('coaching_bookings')")
    expect(pastFn).toContain('coaching_slots!inner(slot_date, start_time)')
    expect(pastFn).toContain('comparePastCoachingBookingSortKeys')
    expect(pastFn).toContain(".in('id', pageIds)")
    expect(pastFn).not.toMatch(/\.from\('coaching_slots'\)/)
    expect(queries).toContain('fullNameKanaIlikePattern')
  })
})

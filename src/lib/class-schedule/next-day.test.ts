import { describe, expect, it } from 'vitest'
import {
  excludeNextClassDayFromUpcoming,
  pickNextClassDay,
  splitNextAndUpcomingClassDays,
  upcomingClassScheduleEmptyMessage,
} from '@/lib/class-schedule/queries'
import { getTotalPages, parsePageParam } from '@/lib/pagination'
import type { ClassScheduleDayWithSessions } from '@/types/class-schedule'

function day(
  partial: Partial<ClassScheduleDayWithSessions> & {
    id: string
    schedule_date: string
    sessions: ClassScheduleDayWithSessions['sessions']
  },
): ClassScheduleDayWithSessions {
  return {
    venue_name: '会場',
    location_details: null,
    address: null,
    map_url: null,
    room_note: null,
    status: 'scheduled',
    notify_revision: 1,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    ...partial,
  }
}

function session(
  partial: Partial<ClassScheduleDayWithSessions['sessions'][number]> & {
    id: string
    start_time: string
    end_time: string
  },
): ClassScheduleDayWithSessions['sessions'][number] {
  return {
    day_id: 'd1',
    subject: '英語',
    note: null,
    status: 'scheduled',
    created_at: '',
    updated_at: '',
    ...partial,
  }
}

describe('pickNextClassDay', () => {
  it('returns all sessions on the nearest eligible day', () => {
    const result = pickNextClassDay(
      [
        day({
          id: 'd1',
          schedule_date: '2026-09-08',
          sessions: [
            session({ id: 's1', start_time: '10:00', end_time: '11:00' }),
            session({ id: 's2', start_time: '13:00', end_time: '14:00' }),
          ],
        }),
      ],
      '2026-09-07',
      '09:00',
    )
    expect(result?.sessions.map((s) => s.id)).toEqual(['s1', 's2'])
  })

  it('skips cancelled days and days with only cancelled sessions', () => {
    const result = pickNextClassDay(
      [
        day({
          id: 'd0',
          schedule_date: '2026-09-08',
          status: 'cancelled',
          sessions: [session({ id: 's0', start_time: '10:00', end_time: '11:00' })],
        }),
        day({
          id: 'd1',
          schedule_date: '2026-09-09',
          sessions: [
            session({
              id: 's1',
              start_time: '10:00',
              end_time: '11:00',
              status: 'cancelled',
            }),
          ],
        }),
        day({
          id: 'd2',
          schedule_date: '2026-09-10',
          sessions: [session({ id: 's2', start_time: '09:00', end_time: '10:00' })],
        }),
      ],
      '2026-09-08',
      '08:00',
    )
    expect(result?.id).toBe('d2')
  })

  it('on today returns ended + remaining + cancelled for the full day plan', () => {
    const result = pickNextClassDay(
      [
        day({
          id: 'd1',
          schedule_date: '2026-09-08',
          sessions: [
            session({ id: 's1', start_time: '09:00', end_time: '10:00' }),
            session({
              id: 's1b',
              start_time: '10:00',
              end_time: '10:30',
              status: 'cancelled',
            }),
            session({ id: 's2', start_time: '10:30', end_time: '11:30' }),
            session({ id: 's3', start_time: '13:00', end_time: '14:00' }),
          ],
        }),
      ],
      '2026-09-08',
      '10:45',
    )
    expect(result?.sessions.map((s) => s.id)).toEqual(['s1', 's1b', 's2', 's3'])
  })

  it('moves to next day when today scheduled sessions are all finished', () => {
    const result = pickNextClassDay(
      [
        day({
          id: 'd1',
          schedule_date: '2026-09-08',
          sessions: [
            session({ id: 's1', start_time: '09:00', end_time: '10:00' }),
            session({
              id: 's1c',
              start_time: '11:00',
              end_time: '12:00',
              status: 'cancelled',
            }),
          ],
        }),
        day({
          id: 'd2',
          schedule_date: '2026-09-09',
          sessions: [session({ id: 's2', start_time: '10:00', end_time: '11:00' })],
        }),
      ],
      '2026-09-08',
      '12:00',
    )
    expect(result?.id).toBe('d2')
    expect(result?.sessions.map((s) => s.id)).toEqual(['s2'])
  })
})

describe('splitNextAndUpcomingClassDays (no duplicate day)', () => {
  it('excludes the next class day entirely from upcoming', () => {
    const days = [
      day({
        id: 'd-next',
        schedule_date: '2026-09-10',
        sessions: [
          session({ id: 's1', start_time: '10:00', end_time: '11:00' }),
          session({ id: 's2', start_time: '13:00', end_time: '14:00' }),
        ],
      }),
      day({
        id: 'd-later',
        schedule_date: '2026-09-11',
        sessions: [session({ id: 's3', start_time: '09:00', end_time: '10:00' })],
      }),
    ]
    const { next, upcoming } = splitNextAndUpcomingClassDays(
      days,
      '2026-09-09',
      '08:00',
    )
    expect(next?.id).toBe('d-next')
    expect(upcoming.map((d) => d.id)).toEqual(['d-later'])
    expect(upcoming.some((d) => d.schedule_date === '2026-09-10')).toBe(false)
  })

  it('keeps cancelled days that were skipped by next selection', () => {
    const days = [
      day({
        id: 'd-cancel',
        schedule_date: '2026-09-09',
        status: 'cancelled',
        sessions: [session({ id: 'sc', start_time: '10:00', end_time: '11:00' })],
      }),
      day({
        id: 'd-next',
        schedule_date: '2026-09-10',
        sessions: [session({ id: 'sn', start_time: '10:00', end_time: '11:00' })],
      }),
      day({
        id: 'd-later',
        schedule_date: '2026-09-12',
        sessions: [session({ id: 'sl', start_time: '10:00', end_time: '11:00' })],
      }),
    ]
    const { next, upcoming } = splitNextAndUpcomingClassDays(
      days,
      '2026-09-09',
      '08:00',
    )
    expect(next?.id).toBe('d-next')
    expect(upcoming.map((d) => d.id)).toEqual(['d-cancel', 'd-later'])
  })

  it('when there is no next day, upcoming stays unchanged', () => {
    const days = [
      day({
        id: 'd1',
        schedule_date: '2026-09-10',
        status: 'cancelled',
        sessions: [session({ id: 's1', start_time: '10:00', end_time: '11:00' })],
      }),
    ]
    const { next, upcoming } = splitNextAndUpcomingClassDays(
      days,
      '2026-09-10',
      '08:00',
    )
    expect(next).toBeNull()
    expect(upcoming).toEqual(days)
  })

  it('when only the next day exists, upcoming is empty', () => {
    const days = [
      day({
        id: 'd1',
        schedule_date: '2026-09-10',
        sessions: [session({ id: 's1', start_time: '10:00', end_time: '11:00' })],
      }),
    ]
    const { next, upcoming } = splitNextAndUpcomingClassDays(
      days,
      '2026-09-09',
      '08:00',
    )
    expect(next?.id).toBe('d1')
    expect(upcoming).toEqual([])
  })

  it('today with mixed ended/future still excludes that whole day from upcoming', () => {
    const days = [
      day({
        id: 'd-today',
        schedule_date: '2026-09-08',
        sessions: [
          session({ id: 's1', start_time: '09:00', end_time: '10:00' }),
          session({ id: 's2', start_time: '15:00', end_time: '16:00' }),
        ],
      }),
      day({
        id: 'd-tomorrow',
        schedule_date: '2026-09-09',
        sessions: [session({ id: 's3', start_time: '10:00', end_time: '11:00' })],
      }),
    ]
    const { next, upcoming } = splitNextAndUpcomingClassDays(
      days,
      '2026-09-08',
      '12:00',
    )
    expect(next?.id).toBe('d-today')
    expect(upcoming.map((d) => d.id)).toEqual(['d-tomorrow'])
  })
})

describe('excludeNextClassDayFromUpcoming', () => {
  it('excludes by schedule_date even if ids differ', () => {
    const days = [
      day({
        id: 'a',
        schedule_date: '2026-09-10',
        sessions: [session({ id: 's1', start_time: '10:00', end_time: '11:00' })],
      }),
      day({
        id: 'b',
        schedule_date: '2026-09-11',
        sessions: [session({ id: 's2', start_time: '10:00', end_time: '11:00' })],
      }),
    ]
    expect(
      excludeNextClassDayFromUpcoming(days, {
        id: 'other',
        schedule_date: '2026-09-10',
      }).map((d) => d.id),
    ).toEqual(['b'])
  })
})

describe('upcomingClassScheduleEmptyMessage', () => {
  it('avoids contradicting next-hero when only next remains', () => {
    expect(upcomingClassScheduleEmptyMessage(true)).toBe(
      '次回以降の予定はありません',
    )
    expect(upcomingClassScheduleEmptyMessage(false)).toBe(
      '今後の授業予定はありません。',
    )
  })
})

describe('pagination totals with exclusion (logic)', () => {
  it('recomputes page bounds from excluded totalCount', () => {
    const totalWithoutExclude = 11
    const totalWithExclude = totalWithoutExclude - 1
    const pageSize = 10
    expect(getTotalPages(totalWithExclude, pageSize)).toBe(1)
    expect(parsePageParam('2', getTotalPages(totalWithExclude, pageSize))).toBe(1)
  })
})

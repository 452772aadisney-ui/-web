import { describe, expect, it } from 'vitest'
import { pickNextClassDay } from '@/lib/class-schedule/queries'
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
  it('returns all remaining sessions on the nearest day', () => {
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

  it('on today keeps in-progress and future sessions, skips ended', () => {
    const result = pickNextClassDay(
      [
        day({
          id: 'd1',
          schedule_date: '2026-09-08',
          sessions: [
            session({ id: 's1', start_time: '09:00', end_time: '10:00' }),
            session({ id: 's2', start_time: '10:30', end_time: '11:30' }),
            session({ id: 's3', start_time: '13:00', end_time: '14:00' }),
          ],
        }),
      ],
      '2026-09-08',
      '10:45',
    )
    expect(result?.sessions.map((s) => s.id)).toEqual(['s2', 's3'])
  })

  it('moves to next day when today sessions are all finished', () => {
    const result = pickNextClassDay(
      [
        day({
          id: 'd1',
          schedule_date: '2026-09-08',
          sessions: [session({ id: 's1', start_time: '09:00', end_time: '10:00' })],
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
  })
})

import { describe, expect, it } from 'vitest'
import {
  resolveAttendeeChangeNotifyAudience,
  resolveDayNotifyAudience,
  resolveSessionNotifyAudience,
} from '@/lib/class-schedule/notify-audience'

describe('notify audience scoping', () => {
  it('day aggregate expands to all kisotsu when any all-audience session exists', () => {
    expect(
      resolveDayNotifyAudience([
        { sessionId: 'a', audienceType: 'targeted', attendeeIds: ['s1'] },
        { sessionId: 'b', audienceType: 'all_kisotsu', attendeeIds: [] },
      ]),
    ).toBe('all_kisotsu')
  })

  it('day aggregate unions targeted attendees only', () => {
    expect(
      resolveDayNotifyAudience([
        { sessionId: 'a', audienceType: 'targeted', attendeeIds: ['s1', 's2'] },
        { sessionId: 'b', audienceType: 'targeted', attendeeIds: ['s2', 's3'] },
      ]),
    ).toEqual(['s1', 's2', 's3'])
  })

  it('session change does not expand via sibling all-audience sessions', () => {
    expect(
      resolveSessionNotifyAudience({
        sessionId: 'a',
        audienceType: 'targeted',
        attendeeIds: ['s1'],
      }),
    ).toEqual(['s1'])
  })

  it('attendee change notifies removed and added students', () => {
    expect(
      resolveAttendeeChangeNotifyAudience({
        beforeIds: ['s1', 's2'],
        afterIds: ['s2', 's3'],
      }),
    ).toEqual(['s1', 's2', 's3'])
  })
})

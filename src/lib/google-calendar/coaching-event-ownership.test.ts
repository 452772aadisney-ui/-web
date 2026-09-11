import { describe, expect, it } from 'vitest'
import {
  buildCoachingCalendarExtendedProperties,
  resolveCoachingCalendarEventOwnership,
} from '@/lib/google-calendar/coaching-event-ownership'
import { coachingBookingCalendarEventId } from '@/lib/google-calendar/stable-event-id'

const BOOKING = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

describe('coaching calendar event ownership', () => {
  it('accepts private extendedProperties matching booking id', () => {
    const props = buildCoachingCalendarExtendedProperties(BOOKING)
    expect(
      resolveCoachingCalendarEventOwnership({
        bookingId: BOOKING,
        eventId: 'random-legacy-id',
        privateBookingId: props.private.coachingBookingId,
        dbEventId: null,
        eventStatus: 'confirmed',
      }).ok,
    ).toBe(true)
  })

  it('rejects same-title events for a different booking', () => {
    const props = buildCoachingCalendarExtendedProperties(OTHER)
    const result = resolveCoachingCalendarEventOwnership({
      bookingId: BOOKING,
      eventId: 'evt-other',
      privateBookingId: props.private.coachingBookingId,
      dbEventId: null,
      eventStatus: 'confirmed',
    })
    expect(result.ok).toBe(false)
  })

  it('accepts stable event id even without private props', () => {
    const eventId = coachingBookingCalendarEventId(BOOKING)
    expect(
      resolveCoachingCalendarEventOwnership({
        bookingId: BOOKING,
        eventId,
        privateBookingId: null,
        dbEventId: null,
        eventStatus: 'cancelled',
        requireStrongOwnership: true,
      }),
    ).toEqual({ ok: true, via: 'stable_id' })
  })

  it('refuses cancelled restore when only weak legacy db link exists', () => {
    const result = resolveCoachingCalendarEventOwnership({
      bookingId: BOOKING,
      eventId: 'legacy-random-id',
      privateBookingId: null,
      dbEventId: 'legacy-random-id',
      eventStatus: 'cancelled',
      requireStrongOwnership: true,
    })
    expect(result.ok).toBe(false)
  })

  it('allows legacy db link for non-restore updates', () => {
    expect(
      resolveCoachingCalendarEventOwnership({
        bookingId: BOOKING,
        eventId: 'legacy-random-id',
        privateBookingId: null,
        dbEventId: 'legacy-random-id',
        eventStatus: 'confirmed',
        requireStrongOwnership: false,
      }),
    ).toEqual({ ok: true, via: 'db_event_id' })
  })
})
